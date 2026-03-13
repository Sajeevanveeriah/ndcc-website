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
  stripe_link: string;
  published: boolean;
  created_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  name: string;
  email: string;
  quantity: number;
  payment_status: string;
  created_at: string;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: string;
  logo_url: string;
  website: string;
  placement_type: string;
  active: boolean;
  created_at: string;
}

export interface NewsPost {
  id: string;
  title: string;
  content: string;
  author: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
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
  name: string;
  grade: string;
  description: string;
  captain?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  sizes: string[];
  image: string;
  stripe_link?: string;
}
