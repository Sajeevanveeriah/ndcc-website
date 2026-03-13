-- NDCC Website Database Schema
-- Run this in the Supabase SQL Editor to set up all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Volunteers
CREATE TABLE IF NOT EXISTS volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'General Help',
  availability TEXT NOT NULL DEFAULT '',
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  items JSONB NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  payment_status TEXT DEFAULT 'pending',
  processed BOOLEAN DEFAULT FALSE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  enquiry_type TEXT DEFAULT 'general',
  responded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  date TIMESTAMPTZ NOT NULL,
  location TEXT DEFAULT 'Grinter Reserve',
  capacity INTEGER,
  ticket_price NUMERIC(10,2) DEFAULT 0,
  stripe_link TEXT,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event Registrations
CREATE TABLE IF NOT EXISTS event_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  payment_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sponsors
CREATE TABLE IF NOT EXISTS sponsors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'standard',
  logo_url TEXT,
  website TEXT,
  placement_type TEXT DEFAULT 'listing',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- News
CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT DEFAULT 'NDCC',
  published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'committee',
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Public read policies (published/active content only)
CREATE POLICY "Public can read published events" ON events
  FOR SELECT USING (published = TRUE);

CREATE POLICY "Public can read published news" ON news
  FOR SELECT USING (published = TRUE);

CREATE POLICY "Public can read active sponsors" ON sponsors
  FOR SELECT USING (active = TRUE);

-- Public insert policies (form submissions)
CREATE POLICY "Public can insert volunteers" ON volunteers
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Public can insert contacts" ON contacts
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Public can insert orders" ON orders
  FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Public can insert event registrations" ON event_registrations
  FOR INSERT WITH CHECK (TRUE);

-- Authenticated admin policies (full CRUD)
CREATE POLICY "Admins have full access to volunteers" ON volunteers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins have full access to orders" ON orders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins have full access to contacts" ON contacts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins have full access to events" ON events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins have full access to event registrations" ON event_registrations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins have full access to sponsors" ON sponsors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins have full access to news" ON news
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins have full access to profiles" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- Committee member policies (read + limited update)
CREATE POLICY "Committee can read volunteers" ON volunteers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can update volunteer processed status" ON volunteers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can read orders" ON orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can update order processed status" ON orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can read contacts" ON contacts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can update contact responded status" ON contacts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can read events" ON events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can read event registrations" ON event_registrations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can read sponsors" ON sponsors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can read news" ON news
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

CREATE POLICY "Committee can read profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'committee'))
  );

-- ============================================
-- SEED DATA (Optional - Placeholder Events/News)
-- ============================================

-- Insert placeholder events
INSERT INTO events (title, description, date, location, capacity, ticket_price, published) VALUES
  ('Presentation Night', 'Join us for our annual Presentation Night to celebrate the achievements of our players and volunteers. Awards for all teams, dinner included, and plenty of Dinos spirit.', '2026-03-28T18:00:00+11:00', 'Grinter Reserve Clubrooms, Moolap', 120, 30.00, TRUE),
  ('Season Launch 2026/27', 'Kick off the new cricket season with the Dinos! Meet the coaches, hear about plans for the season ahead, and register for your team. Free entry — all welcome.', '2026-09-12T14:00:00+10:00', 'Grinter Reserve, Moolap', NULL, 0.00, TRUE),
  ('Trivia Night', 'Test your knowledge at our annual fundraising Trivia Night! Tables of 8, BYO nibbles, drinks available at the bar. All proceeds go towards junior cricket equipment.', '2026-11-14T19:00:00+11:00', 'Grinter Reserve Clubrooms, Moolap', 80, 20.00, TRUE);

-- Insert placeholder news
INSERT INTO news (title, content, author, published, published_at) VALUES
  ('Welcome to the New NDCC Website', 'We''re excited to launch our brand new website for the Newcomb and District Cricket Club! This site will be your one-stop shop for everything Dinos — fixtures, news, events, merchandise, and more. We''ll be adding new features throughout the season, so check back regularly. If you have any feedback or suggestions, please get in touch via the contact page. Go Dinos!', 'NDCC', TRUE, NOW()),
  ('Training Facility Grand Opening', 'The Peter ''Skinny'' Harrison Training Facility officially opened in August 2024 and has been a game-changer for the club. With 3 public synthetic lanes and 4 club turf lanes, our players now have access to top-quality training facilities right here at Grinter Reserve. The facility is named in honour of Peter Harrison, a beloved member of the NDCC family whose dedication to the club spanned decades.', 'NDCC', TRUE, NOW() - INTERVAL '7 days'),
  ('Season 2025/26 Registration Open', 'Registrations for the 2025/26 season are now open! Whether you''re a seasoned player or picking up a bat for the first time, there''s a place for you at NDCC. We have teams for Senior Men (GCA Grade 4), Senior Women (GCA E Grade East), and Junior Boys. Head to the Contact page or reach out to any committee member to register. Early bird registrations close October 1.', 'NDCC', TRUE, NOW() - INTERVAL '14 days');

-- Insert placeholder sponsors
INSERT INTO sponsors (name, tier, website, placement_type, active) VALUES
  ('Local Business Partner', 'major', 'https://example.com', 'homepage', TRUE),
  ('Community Supporter', 'gold', 'https://example.com', 'listing', TRUE),
  ('Neighbourhood Café', 'silver', 'https://example.com', 'listing', TRUE);
