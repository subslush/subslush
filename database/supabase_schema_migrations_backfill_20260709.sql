-- Prepared from supabase_schema_20260709.sql; review before running on Supabase.
-- Includes only migration files verified present in the live public schema dump.
-- Excludes pending/unverifiable migrations listed in the QA Step 1.5 report.
BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP DEFAULT NOW(),
    execution_time_ms INTEGER,
    checksum VARCHAR(64),
    applied_by VARCHAR(100) DEFAULT CURRENT_USER
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON public.schema_migrations(version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON public.schema_migrations(applied_at);

COMMENT ON TABLE public.schema_migrations IS 'Tracks database schema migration history';
COMMENT ON COLUMN public.schema_migrations.version IS 'Migration timestamp in YYYYMMDD_HHMMSS format';
COMMENT ON COLUMN public.schema_migrations.checksum IS 'SHA-256 hash of migration content for integrity verification';

INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum, applied_by) VALUES
    ('20250925_120000', 'add_payment_tracking', 0, '504cc9c56438b38ceb9bc3b701fbb652d397d0724166d1d2aaec8bee2b6f48d8', 'supabase_schema_20260709_reconciliation'),
    ('20250926_134800', 'add_waiting_payment_status', 0, '1f8891295615c8bb7a705520057edaa47c0f9a39fd50467396b50f93bb9742d1', 'supabase_schema_20260709_reconciliation'),
    ('20250926_140000', 'add_payment_workflow_support', 0, '26971ac7167e1a4de43206937a8e8eab82186cfd210146b1982957ca7c99cc4b', 'supabase_schema_20260709_reconciliation'),
    ('20250930', 'add_name_columns', 0, 'fed5d1624f3bd7601cd5165003f1405e5ba7012290ce128739d44f371336e932', 'supabase_schema_20260709_reconciliation'),
    ('20251010_115000', 'bootstrap_core_tables', 0, '1569bb914c5669a2a7a3c5a6f22de9143a1e685c11afde6ebbc074c618c285be', 'supabase_schema_20260709_reconciliation'),
    ('20251010_120000', 'add_payments_table', 0, 'a49f1213ba07d94174819f0bc218e05bdf6d024a04ff42ac03f57741b925a019', 'supabase_schema_20260709_reconciliation'),
    ('20251014_120000', 'create_prelaunch_tables', 0, '7b0f2ddba503c5d7762bb5f27788ca148d0ce295d706839fb033115fc11578cb', 'supabase_schema_20260709_reconciliation'),
    ('20251015_120000', 'schema_alignment_admin', 0, '8c5c7b8c3ec8ccc104d751203dd3f2e4063a0fd78d62460a76ee44e838b1f8fd', 'supabase_schema_20260709_reconciliation'),
    ('20251015_130000', 'add_prelaunch_fk_constraints', 0, 'fc557dd97c338027e8c2cdd1cba1a5ed6f07a46aad9c9c2002051d409b9ec5ca', 'supabase_schema_20260709_reconciliation'),
    ('20251016_110000', 'backfill_users_from_auth', 0, '5cbb558033394dd17557b2fafe25dd6577620ee5098ccb144c4675f370386520', 'supabase_schema_20260709_reconciliation'),
    ('20251016_120000', 'prelaunch_data_migration_dry_run', 0, 'af4334d03e715cb52357b6baf5cec225e7b0dc5d178085c0af048efacc9ed19b', 'supabase_schema_20260709_reconciliation'),
    ('20251016_121000', 'prelaunch_data_migration_apply', 0, '8b64ea26e3ae36159ab0d93d95fa92c331bef5cb6b3c8ed018d1d315ac93b5bf', 'supabase_schema_20260709_reconciliation'),
    ('20251020_120000', 'add_credit_transaction_constraints', 0, 'bdce51a5f3c1b3839368bb4831cbf42d8f405e9dd0178487c4031429adef8cda', 'supabase_schema_20260709_reconciliation'),
    ('20251021_120000', 'add_payment_subscription_uniques', 0, 'aa3a45f5191e9eda114bc05b8cd28239ee0eb43863f8f13c01b43f953609994f', 'supabase_schema_20260709_reconciliation'),
    ('20251231_140000', 'fix_contest_prize_time_comparison', 0, 'ab2da8bacb7d0425553b81feed6082f9589514ef2e311be9bc40f7f45f73abea', 'supabase_schema_20260709_reconciliation'),
    ('20251231_141000', 'add_subscriptions_updated_at', 0, '792cc80b8bb7c0f3cd8e397f780732a7985d4c197b76e3884ca7a709226fa2af', 'supabase_schema_20260709_reconciliation'),
    ('20260105_120000', 'add_admin_audit_logs', 0, '318d0e363ec76426e743f4c4c413fad2cb904c1700ffe4076514fa94c51ad9d5', 'supabase_schema_20260709_reconciliation'),
    ('20260105_125000', 'add_subscriptions_renewal_date', 0, '816387421ac30387a3d060583850ca92bdc62e065cc46465710851106902398c', 'supabase_schema_20260709_reconciliation'),
    ('20260105_130000', 'add_pin_support_and_dashboard_indexes', 0, '344db16dc6b07ae704b6a3fb437ee87156e535e5e8653ef7506a262b93733b87', 'supabase_schema_20260709_reconciliation'),
    ('20260105_140000', 'backfill_subscription_billing_fields', 0, '8dd13e9aa4e81ab453835fdfd084b84e186a4deb77779bbd1d8a693e94e71074', 'supabase_schema_20260709_reconciliation'),
    ('20260105_150000', 'add_notifications', 0, '618592978be78b37efbc1c1e64ce3aef8e8aafccd338d2857ff6babee0da9a77', 'supabase_schema_20260709_reconciliation'),
    ('20260105_160000', 'add_product_publishing_fields', 0, '3dfdf71dca6cef84ed4a69ca4da64a9b702034ba48dd481bbaeb9a1eef20a074', 'supabase_schema_20260709_reconciliation'),
    ('20260105_170000', 'backfill_product_publishing_defaults', 0, 'c30956bb123f9b8617b058883a76039278c5e64fa5e43967ac3cd7a44473f2e8', 'supabase_schema_20260709_reconciliation'),
    ('20260105_180000', 'add_notification_cleared_at', 0, '4a78f05c8bd0287408582af1a5e56e4c8105429bcd4d2acdfcbdc72dee8880d6', 'supabase_schema_20260709_reconciliation'),
    ('20260106_120000', 'add_user_status_audit', 0, 'b3444e1952d435482f81a574d889f4d7194cf3d1c6e13a9c59dcf1d6a416a1da', 'supabase_schema_20260709_reconciliation'),
    ('20260107_120000', 'add_email_verified_at', 0, 'cf74f8ed3785eb1265c1afc1d5b98e275646197d56ec2050f222d2cfcec82717', 'supabase_schema_20260709_reconciliation'),
    ('20260108_120000', 'add_admin_task_issue_flag', 0, '3222df56f1e2c109a87b7ed516daa63eea8298a708284451ab9422ab447734a7', 'supabase_schema_20260709_reconciliation'),
    ('20260110_120000', 'add_admin_task_payment_confirmed_at', 0, 'c9b05cfe5907de5debabd812b4c9bf1f73cdf88a877dbf589976e533de933a3f', 'supabase_schema_20260709_reconciliation'),
    ('20260111_120000', 'add_stripe_auto_renewal', 0, '769518ba0dc0174720ed7edd67cddb72fc042f34babea98ae87edb6f8d0a1d0c', 'supabase_schema_20260709_reconciliation'),
    ('20260112_120000', 'add_variant_terms_and_pricing_snapshot', 0, 'bd0ee40ecd264ca708739a53adfd2441d38538523cf35d121c279d7a8021e272', 'supabase_schema_20260709_reconciliation'),
    ('20260112_130000', 'backfill_term_months', 0, '2c3f4dad98e47ea3a2393f8e44271b1fd07587fc455041e4d3cf77c2aef10ff4', 'supabase_schema_20260709_reconciliation'),
    ('20260113_120000', 'add_coupons', 0, 'd890c4f503f46831d46b639fb88ecf2ce421d8baa7e83a2b597330d649d7394d', 'supabase_schema_20260709_reconciliation'),
    ('20260114_120000', 'add_upgrade_selection_and_term_start', 0, '6b4d34033741220ded882365ec7537e32bf359a1b34aacb2260fdfc682ab2833', 'supabase_schema_20260709_reconciliation'),
    ('20260115_120000', 'add_newsletter_subscriptions', 0, '75b5d785886e743910ea9c3b4a000b1ad08fa3dc84b2d13517ee56b5209a5807', 'supabase_schema_20260709_reconciliation'),
    ('20260116_120000', 'add_bis_inquiries', 0, '27014f25755598e681ce222aca7fbfc9a2c9bbf1c4d63cdbbb5926aa61850cb9', 'supabase_schema_20260709_reconciliation'),
    ('20260117_120000', 'add_pin_reset_requests', 0, 'c6fd1abf99b5b669db1b90fd071f4b1fe0ac39bb22449814ca735244c7fab1ae', 'supabase_schema_20260709_reconciliation'),
    ('20260118_120000', 'drop_prelaunch_contest_tables', 0, 'f679a33c191b5c4ddc4dfffdb72bc8f26cd5bbe82272d7439e08729629a5e21a', 'supabase_schema_20260709_reconciliation'),
    ('20260119_120000', 'supabase_schema_alignment', 0, '39db313e2e9245617328e167862288be98372b142f09df5432e3412081d938fd', 'supabase_schema_20260709_reconciliation'),
    ('20260120_120000', 'drop_prelaunch_contest_routines', 0, 'abd579fd8f6e47321001e1a68b683932e8d8b376c8cfa784f4ab69fa431faac3', 'supabase_schema_20260709_reconciliation'),
    ('20260121_140000', 'add_coupon_term_months', 0, 'f4cd417e5c62cd346355242b69f9e69673a00336fc589a3daef38a480ef5fc53', 'supabase_schema_20260709_reconciliation'),
    ('20260212_120000', 'add_multi_item_guest_checkout_foundations', 0, '045505c1d51a425ac5254a2731c82578ca433c3333d379614b0fde3cba4ebfcb', 'supabase_schema_20260709_reconciliation'),
    ('20260216_040000', 'fix_payment_item_singleton_uuid', 0, 'fa0dfb62f533ce868628ea595c4aad33c22a2cd16785ed610f18ecd735031723', 'supabase_schema_20260709_reconciliation'),
    ('20260223_120000', 'add_pay4bit_fx_pricing_foundations', 0, 'e51dc3ee4d4498abb7a2e79b6e45cb585c4565841871ef8c6c7f999708832af7', 'supabase_schema_20260709_reconciliation'),
    ('20260317_120000', 'add_product_sub_category', 0, '5b60ac85218bbec26435565a43e14298a7c009b850764d91ff0d361b15c9fbc2', 'supabase_schema_20260709_reconciliation'),
    ('20260318_120000', 'add_product_sub_categories', 0, '1435cfb1a62f543ff2ef63c5b62007690d64a4598dbdd5929a18deb91b14d6a7', 'supabase_schema_20260709_reconciliation'),
    ('20260327_120000', 'add_fixed_product_price_history', 0, 'b27dcffb7a7c08f20c270c774ac5a31fe81d1365cd3a5f65ddd9e43e5f6586d8', 'supabase_schema_20260709_reconciliation'),
    ('20260327_130000', 'add_product_sub_category_map', 0, '4cd3698a0df92a95031304b5658fb7a325b35e0713c49c954de800fa5941781a', 'supabase_schema_20260709_reconciliation'),
    ('20260328_120000', 'add_product_category_map', 0, '5412f6ff6b2c8be63d2019270bf6a89f0481e7917e001b8f46cb19c1fda8c249', 'supabase_schema_20260709_reconciliation'),
    ('20260330_120000', 'add_maxmind_risk_assessments', 0, 'a77230d5a468d0b4b46d4841a43600835becbae7fdd37a5bae23eb5300af29c3', 'supabase_schema_20260709_reconciliation'),
    ('20260422_120000', 'add_paypal_provider_constraints', 0, '5e218d2738732ed77e72e4b871b5156e0a09f182550f3ff2c1352416e5f12a3b', 'supabase_schema_20260709_reconciliation'),
    ('20260427_120000', 'add_order_compliance_evidence_logs', 0, 'ff7fa88ab45891a51eba011930742ce073c829ea8c170afeb2661fbeb6e66054', 'supabase_schema_20260709_reconciliation'),
    ('20260604_120000', 'add_payop_provider_constraints', 0, '64b19b105e4a2827abbbaecda5b13159ffacb7ec104598df74916f3a14138fbb', 'supabase_schema_20260709_reconciliation'),
    ('20260615_120000', 'add_antom_provider_constraints', 0, 'caf21fe88d2c652938b032e8f29cdb00d3e5575f8b5a2a6a2986d08d03a1f454', 'supabase_schema_20260709_reconciliation')
ON CONFLICT (version) DO UPDATE SET
    name = EXCLUDED.name,
    checksum = EXCLUDED.checksum,
    applied_by = EXCLUDED.applied_by;

COMMIT;
