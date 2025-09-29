export const formatName = (firstName?: string, lastName?: string): string => {
  if (!firstName && !lastName) return '';
  if (!firstName) return lastName || '';
  if (!lastName) return firstName;
  return `${firstName} ${lastName}`;
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return formatDate(dateString);
};

export const truncateEmail = (email: string, maxLength: number = 20): string => {
  if (email.length <= maxLength) return email;

  const [local, domain] = email.split('@');
  if (local.length <= maxLength - domain.length - 4) {
    return email;
  }

  const truncatedLocal = local.substring(0, maxLength - domain.length - 7);
  return `${truncatedLocal}...@${domain}`;
};