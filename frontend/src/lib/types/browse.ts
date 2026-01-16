// Browse page specific types extending the existing subscription types
import type { ServiceType, ServicePlan, SubscriptionDetail } from './subscription.js';

export interface BrowseFilters {
  category: string;
  searchQuery: string;
  priceRange: { min: number; max: number };
  sortBy: 'recommended' | 'price_low' | 'price_high' | 'popularity' | 'savings';
  availability: 'all' | 'available' | 'filling_fast';
}

export interface SavingsCalculation {
  totalRetailPrice: number;
  totalSubSlushPrice: number;
  monthlySavings: number;
  yearlySavings: number;
  savingsPercentage: number;
}

export interface HoveredSubscription {
  serviceType: string;
  retailPrice: number;
  subslushPrice: number;
  monthlySavings: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  icon: string;
  count: number;
}

export interface BrowseSubscription {
  id: string;
  serviceType: ServiceType;
  serviceName: string;
  planName: string;
  planType: ServicePlan;
  description: string;
  price: number;
  originalPrice: number;
  currency: string;
  features: string[];
  ratings: {
    average: number;
    count: number;
  };
  host: {
    id: string;
    name: string;
    isVerified: boolean;
    joinDate: string;
    lastUpdated: string;
  };
  availability: {
    totalSeats: number;
    occupiedSeats: number;
    availableSeats: number;
  };
  badges: string[]; // 'verified', 'popular', 'new', 'filling_fast'
  category: string;
  logo_key?: string | null;
  logoKey?: string | null;
  logoUrl?: string;
  monthlySavings: number;
  savingsPercentage: number;
}

export interface BrowsePageData {
  subscriptions: BrowseSubscription[];
  totalCount: number;
  userBalance: number;
  categories: CategoryOption[];
  error?: string;
}

export interface SearchResult {
  id: string;
  serviceType: ServiceType;
  serviceName: string;
  planName: string;
  price: number;
  logoUrl?: string;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface SortOption {
  value: string;
  label: string;
  icon?: string;
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

// Event types for component communication
export interface BrowseEvents {
  'subscription:hover': HoveredSubscription;
  'subscription:hoverEnd': HoveredSubscription;
  'subscription:click': BrowseSubscription;
  'filter:change': BrowseFilters;
  'search:query': string;
  'category:select': string;
  'sort:change': string;
  'page:change': number;
}

// Component prop types
export interface SavingsSpeedometerProps {
  currentSavings: number;
  maxSavings: number;
  userSavingsData?: {
    averageSavings: number;
    comparisonCount: number;
  };
}

export interface SubscriptionCardProps {
  subscription: BrowseSubscription;
  isHovered?: boolean;
  showCompareButton?: boolean;
  onHover?: (subscription: BrowseSubscription) => void;
  onHoverEnd?: (subscription: BrowseSubscription) => void;
  onClick?: (subscription: BrowseSubscription) => void;
}

export interface CategoryFilterProps {
  categories: CategoryOption[];
  selectedCategory: string;
  onCategorySelect: (categoryId: string) => void;
}

export interface SearchBarProps {
  query: string;
  placeholder?: string;
  suggestions?: SearchResult[];
  isLoading?: boolean;
  onQueryChange: (query: string) => void;
  onSuggestionSelect: (result: SearchResult) => void;
}
