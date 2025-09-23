#!/usr/bin/env node
/* eslint-disable no-console, no-undef */

/**
 * Data Migration Script: Transfer Profile Data from Supabase to PostgreSQL
 *
 * This script migrates existing user profile data from Supabase Auth metadata
 * to the new PostgreSQL profile columns.
 *
 * Usage:
 *   node migrate_existing_profile_data.js
 *
 * Environment variables required:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - SUPABASE_URL: Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key (for admin operations)
 */

const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

// Configuration
const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  databaseUrl: process.env.DATABASE_URL,
};

// Validate configuration
function validateConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!config.databaseUrl) missing.push('DATABASE_URL');

  if (missing.length > 0) {
    console.error(
      '❌ Missing required environment variables:',
      missing.join(', ')
    );
    process.exit(1);
  }
}

// Initialize clients
let supabase;
let pool;

function initializeClients() {
  supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  pool = new Pool({ connectionString: config.databaseUrl });
}

// Migration statistics
const stats = {
  totalUsers: 0,
  usersWithMetadata: 0,
  successfulMigrations: 0,
  failedMigrations: 0,
  errors: [],
};

/**
 * Get all users from PostgreSQL database
 */
async function getAllUsers() {
  console.log('📋 Fetching all users from PostgreSQL...');

  const result = await pool.query(`
    SELECT id, email, created_at,
           display_name, user_timezone, language_preference,
           notification_preferences, profile_updated_at
    FROM users
    WHERE status != 'deleted'
    ORDER BY created_at
  `);

  stats.totalUsers = result.rows.length;
  console.log(`   Found ${stats.totalUsers} users`);

  return result.rows;
}

/**
 * Get user metadata from Supabase
 */
async function getUserMetadata(userId) {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);

    if (error) {
      console.warn(
        `   ⚠️  Failed to fetch Supabase metadata for user ${userId}: ${error.message}`
      );
      return null;
    }

    return data?.user?.user_metadata || {};
  } catch (error) {
    console.warn(
      `   ⚠️  Error fetching metadata for user ${userId}:`,
      error.message
    );
    return null;
  }
}

/**
 * Check if user already has profile data in PostgreSQL
 */
function hasExistingProfileData(user) {
  return !!(
    user.display_name ||
    user.user_timezone ||
    user.language_preference ||
    (user.notification_preferences &&
      Object.keys(user.notification_preferences).length > 0) ||
    user.profile_updated_at
  );
}

/**
 * Migrate profile data for a single user
 */
async function migrateUserProfile(user) {
  console.log(`   📝 Processing user: ${user.email} (${user.id})`);

  // Skip if user already has profile data (likely from new registration flow)
  if (hasExistingProfileData(user)) {
    console.log(
      `      ✅ User already has profile data in PostgreSQL, skipping`
    );
    return true;
  }

  // Get metadata from Supabase
  const metadata = await getUserMetadata(user.id);

  if (!metadata) {
    console.log(`      ℹ️  No Supabase metadata found, skipping`);
    return true;
  }

  // Check if there's any profile data to migrate
  const hasProfileData = !!(
    metadata.display_name ||
    metadata.timezone ||
    metadata.language_preference ||
    metadata.notification_preferences
  );

  if (!hasProfileData) {
    console.log(`      ℹ️  No profile data in Supabase metadata, skipping`);
    return true;
  }

  stats.usersWithMetadata++;

  try {
    // Build update query for profile data
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (metadata.display_name) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(metadata.display_name);
    }

    if (metadata.timezone) {
      updates.push(`user_timezone = $${paramIndex++}`);
      values.push(metadata.timezone);
    }

    if (metadata.language_preference) {
      updates.push(`language_preference = $${paramIndex++}`);
      values.push(metadata.language_preference);
    }

    if (metadata.notification_preferences) {
      updates.push(`notification_preferences = $${paramIndex++}`);
      values.push(JSON.stringify(metadata.notification_preferences));
    }

    // Always set profile_updated_at if we're migrating data
    if (updates.length > 0) {
      updates.push(`profile_updated_at = $${paramIndex++}`);
      values.push(metadata.profile_updated_at || new Date().toISOString());

      // Add user ID for WHERE clause
      values.push(user.id);

      const query = `
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await pool.query(query, values);

      console.log(`      ✅ Successfully migrated profile data`);
      console.log(
        `         - Display Name: ${metadata.display_name || 'none'}`
      );
      console.log(`         - Timezone: ${metadata.timezone || 'none'}`);
      console.log(
        `         - Language: ${metadata.language_preference || 'none'}`
      );
      console.log(
        `         - Notifications: ${metadata.notification_preferences ? 'yes' : 'none'}`
      );

      stats.successfulMigrations++;
      return true;
    }

    return true;
  } catch (error) {
    console.error(`      ❌ Failed to migrate user ${user.id}:`, error.message);
    stats.failedMigrations++;
    stats.errors.push({
      userId: user.id,
      email: user.email,
      error: error.message,
    });
    return false;
  }
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('🚀 Starting profile data migration...\n');

  try {
    // Get all users
    const users = await getAllUsers();

    if (users.length === 0) {
      console.log('ℹ️  No users found to migrate');
      return;
    }

    console.log(`\n📊 Starting migration for ${users.length} users...\n`);

    // Process users in batches to avoid overwhelming the APIs
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      console.log(
        `\n📦 Processing batch ${Math.floor(i / batchSize) + 1} (users ${i + 1}-${Math.min(i + batchSize, users.length)}):`
      );

      // Process batch sequentially to avoid rate limits
      for (const user of batch) {
        await migrateUserProfile(user);
      }

      // Small delay between batches to be respectful to APIs
      if (i + batchSize < users.length) {
        console.log('   ⏳ Pausing between batches...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Print migration summary
 */
function printSummary() {
  console.log('\n📈 Migration Summary:');
  console.log('═══════════════════════════════════════');
  console.log(`📊 Total users processed: ${stats.totalUsers}`);
  console.log(`📋 Users with Supabase metadata: ${stats.usersWithMetadata}`);
  console.log(`✅ Successful migrations: ${stats.successfulMigrations}`);
  console.log(`❌ Failed migrations: ${stats.failedMigrations}`);
  console.log(
    `⏭️  Skipped (no metadata): ${stats.totalUsers - stats.usersWithMetadata - stats.failedMigrations}`
  );

  if (stats.errors.length > 0) {
    console.log('\n❌ Migration Errors:');
    stats.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. User: ${error.email} (${error.userId})`);
      console.log(`      Error: ${error.error}`);
    });
  }

  if (stats.failedMigrations === 0) {
    console.log('\n🎉 Migration completed successfully!');
  } else {
    console.log(
      `\n⚠️  Migration completed with ${stats.failedMigrations} errors. Please review and fix manually.`
    );
  }
}

/**
 * Cleanup resources
 */
async function cleanup() {
  if (pool) {
    await pool.end();
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    validateConfig();
    initializeClients();

    console.log('🔧 Configuration:');
    console.log(`   Supabase URL: ${config.supabaseUrl}`);
    console.log(
      `   Database: ${config.databaseUrl.split('@')[1] || 'configured'}`
    );
    console.log('');

    await runMigration();
    printSummary();
  } catch (error) {
    console.error('\n💥 Fatal error during migration:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  console.log('\n⚠️  Migration interrupted by user');
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Migration terminated');
  await cleanup();
  process.exit(0);
});

// Run migration if called directly
if (require.main === module) {
  main();
}

module.exports = {
  runMigration,
  stats,
};
