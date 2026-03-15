-- NDCC Website Seed Data
-- Run this after schema.sql to populate initial data

-- ============================================
-- SPONSORS (2025/26 Season)
-- ============================================

INSERT INTO sponsors (name, tier, website, placement_type, active) VALUES
  ('Mustaang Cricket Bat Repairs (MBR Cricket)', 'major', 'https://mbrcricket.com', 'homepage', TRUE),
  ('Leopold Sportsmans Club', 'gold', 'https://leopoldsporties.com', 'listing', TRUE),
  ('Champion Trophies', 'gold', 'https://www.swlocksmiths.com.au/trophies-giftware/', 'listing', TRUE),
  ('Phoenix Truck Bodies', 'silver', 'https://phoenixtruckbodies.com.au', 'listing', TRUE),
  ('Blackman''s Brewery', 'silver', 'https://www.blackmansbrewery.com.au', 'listing', TRUE);

-- ============================================
-- NEWS
-- ============================================

INSERT INTO news (title, content, author, published, published_at) VALUES
  ('Welcome to the New NDCC Website', 'We are excited to launch the brand new website for the Newcomb and District Cricket Club. This site is your one-stop shop for everything Dinos - fixtures, news, events, merchandise, and more. We will be adding new features throughout the season, so check back regularly. If you have any feedback or suggestions, please get in touch via the contact page. Go Dinos!', 'NDCC', TRUE, NOW()),
  ('Training Facility Grand Opening', 'The Peter ''Skinny'' Harrison Training Facility officially opened in August 2024 and has been a game-changer for the club. With 3 public synthetic lanes and 4 club turf lanes, our players now have access to top-quality training facilities right here at Grinter Reserve. The facility is named in honour of Peter Harrison, a beloved member of the NDCC family whose dedication to the club spanned decades.', 'NDCC', TRUE, NOW() - INTERVAL '7 days'),
  ('Season 2025/26 Registration Open', 'Registrations for the 2025/26 season are now open. Whether you are a seasoned player or picking up a bat for the first time, there is a place for you at NDCC. We have teams for Senior Men (GCA Grade 4), Senior Women (GCA E Grade East), and Junior Boys. Head to the Contact page or reach out to any committee member to register.', 'NDCC', TRUE, NOW() - INTERVAL '14 days');

-- ============================================
-- EVENTS
-- ============================================

INSERT INTO events (title, description, date, location, capacity, ticket_price, published) VALUES
  ('Presentation Night', 'Join us for our annual Presentation Night to celebrate the achievements of our players and volunteers. Awards for all teams, dinner included, and plenty of Dinos spirit.', '2026-03-28T18:00:00+11:00', 'Grinter Reserve Clubrooms, Moolap', 120, 30.00, TRUE),
  ('Season Launch 2026/27', 'Kick off the new cricket season with the Dinos! Meet the coaches, hear about plans for the season ahead, and register for your team. Free entry, all welcome.', '2026-09-12T14:00:00+10:00', 'Grinter Reserve, Moolap', NULL, 0.00, TRUE),
  ('Trivia Night', 'Test your knowledge at our annual fundraising Trivia Night! Tables of 8, BYO nibbles, drinks available at the bar. All proceeds go towards junior cricket equipment.', '2026-11-14T19:00:00+11:00', 'Grinter Reserve Clubrooms, Moolap', 80, 20.00, TRUE);
