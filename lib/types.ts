export interface Volunteer {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  availability: string;
  processed: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  items: OrderItem[];
  total_amount: number;
  payment_status: string;
  processed: boolean;
  notes: string;
  created_at: string;
}

export interface OrderItem {
  name: string;
  size: string;
  quantity: number;
  price: number;
  // Selected option values keyed by option group (e.g. { "Sleeve length": "long-sleeve" }).
  options?: Record<string, string>;
  // Server-applied option detail (label + surcharge) stored with the order.
  applied_options?: Array<{ group: string; value: string; label: string; price_delta: number }>;
  // Base price before option surcharges, as verified by the server.
  base_price?: number;
  custom_name?: string;
  custom_number?: number;
  alternate_number?: number;
  number_request_status?: 'subject_to_availability';
  personalisation_confirmed?: boolean;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  message: string;
  enquiry_type: string;
  responded: boolean;
  created_at: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  capacity: number | null;
  ticket_price: number;
  stripe_link?: string;
  published: boolean;
  created_at: string;
  image_url?: string | null;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  name: string;
  email: string;
  phone?: string;
  quantity: number;
  payment_status: string;
  payment_reference?: string | null;
  processed?: boolean;
  created_at: string;
}

export interface Publication {
  id: string;
  publication_type: 'monthly_newsletter' | 'weekly_newsletter' | 'weekly_match_report';
  title: string;
  slug: string;
  summary?: string | null;
  content: string;
  issue_date: string;
  season_label?: string | null;
  round_label?: string | null;
  cover_image_url?: string | null;
  document_url?: string | null;
  external_url?: string | null;
  author?: string | null;
  published: boolean;
  published_at?: string | null;
  featured: boolean;
  display_order: number;
  created_at: string;
  updated_at?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: string;
  logo_url: string;
  website: string;
  placement_type: string;
  active: boolean;
  description?: string;
  sort_order?: number;
  source_url?: string | null;
  logo_source_url?: string | null;
  /** Logo plate mode: auto | light | dark | neutral | transparent. */
  logo_surface_mode?: string | null;
  logo_padding?: string | null;
  logo_object_position?: string | null;
  created_at: string;
}

export interface NewsPost {
  id: string;
  title: string;
  content: string;
  author: string;
  sort_order?: number;
  published: boolean;
  published_at: string | null;
  created_at: string;
  image_url?: string | null;
  image?: string;
}

export interface Profile {
  id: string;
  email: string;
  role: string;
  display_name: string;
  created_at: string;
}

export interface CommitteeMember {
  name: string;
  role: string;
  email?: string;
}

export interface TeamInfo {
  id?: string;
  name: string;
  grade: string;
  description: string;
  captain?: string | null;
  playhq_url?: string | null;
  image_url?: string | null;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SeasonAppointment {
  id?: string;
  name: string;
  role: string;
  image?: string;
  image_url?: string | null;
  announcement_date: string;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  sizes: string[];
  image: string;
  stripe_link?: string;
  customisable?: boolean;
}
