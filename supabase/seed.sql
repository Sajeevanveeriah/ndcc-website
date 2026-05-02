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
  ('Annual General Meeting - Wednesday 20 May 2026', 'Members, players, families, volunteers and supporters are invited to attend the Annual General Meeting as the club prepares for the 2026/27 season. Date: Wednesday 20 May 2026. Time: 6:30 pm. Venue: Club rooms, Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224.', 'NDCC Committee', TRUE, '2026-05-01 09:00:00+10'),
  ('Dino Lotto 2026 is Open', 'Dino Lotto has 50 numbers available at AUD 50 per number. One AUD 100 prize is drawn every Friday at 7:00 pm across a 10 week block, starting when all numbers are sold. Each number remains in every weekly draw. To secure a number, contact ndsc.cricket@gmail.com.', 'NDCC Committee', TRUE, '2026-04-30 17:00:00+10'),
  ('Apparel Sponsorship 2026/27', 'Put your brand on Newcomb and District apparel and support community cricket in the 2026/27 season. This opportunity is separate from the standard sponsorship packages. Contact John Elliott, President, on 0419 236 866 or ndsc.cricket@gmail.com.', 'NDCC Committee', TRUE, '2026-04-29 10:00:00+10'),
  ('Welcome to the New NDCC Website', 'We are thrilled to launch the brand-new Newcomb and District Cricket Club website. This platform has been built from the ground up to keep our members, supporters, and the wider Geelong cricket community informed about everything happening at the Dinos. You will find fixtures, event information, merchandise, volunteer opportunities, and much more. We will be continually adding new features, so check back often. Thank you to everyone who contributed to making this happen.', 'NDCC Committee', TRUE, '2026-03-01 09:00:00+11'),
  ('U13s Reach Grand Final', 'Congratulations to our Under 13s side who secured a spot in the GCA grand final after an undefeated 2025/26 season. The grand final was held at Grinter Reserve, capping off a fantastic season for the junior programme. The boys showed incredible dedication and team spirit throughout the year, and the club could not be prouder of their achievement. A huge thank you to the coaches, parents, and volunteers who supported the team all season.', 'NDCC Committee', TRUE, '2026-03-10 10:00:00+11'),
  ('Training Facility Grand Opening', 'The Peter ''Skinny'' Harrison Training Facility was officially opened in August 2024, marking a milestone moment for our club. Named in honour of one of our most beloved and long-serving members, the facility features three public synthetic lanes and four club turf lanes, giving our players access to first-class training surfaces right here at Grinter Reserve in Moolap. The new facility is a game-changer for both senior and junior cricket development at the club.', 'NDCC Committee', TRUE, '2024-08-15 10:00:00+10'),
  ('2026/27 Season Preview', 'With the 2025/26 season now wrapped up, attention turns to the 2026/27 campaign starting in October 2026. Pre-season training will return to the Peter ''Skinny'' Harrison Training Facility at Grinter Reserve, with sessions for all senior and junior squads. We are encouraging new players across men''s, women''s, and junior cricket to get involved. Registrations will open on PlayHQ closer to the season. Keep an eye on our Facebook page and this website for announcements about training schedules and registration dates.', 'NDCC Committee', TRUE, '2026-03-15 08:30:00+11');

-- ============================================
-- EVENTS
-- ============================================

INSERT INTO events (title, description, date, location, capacity, ticket_price, published) VALUES
  ('Annual General Meeting', 'Members, players, families, volunteers and supporters are invited to attend the AGM as the club prepares for the 2026/27 season. Wednesday 20 May 2026, 6:30 pm at the club rooms, Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224.', '2026-05-20T18:30:00+10:00', 'Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224', NULL, 0.00, TRUE),
  ('Dino Lotto 2026', 'Dino Lotto has 50 numbers at AUD 50 each, with an AUD 100 weekly prize across a 10 week block. Draws are Fridays at 7:00 pm and start when all numbers are sold. Each number stays in every weekly draw. Contact ndsc.cricket@gmail.com to secure a number.', '2026-05-22T19:00:00+10:00', 'Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224', 50, 50.00, TRUE),
  ('2025/26 Presentation Night', 'Join us to celebrate the achievements of our players and volunteers for the 2025/26 season. Awards across all teams, dinner, and plenty of Dinos spirit. Held at General Public, Geelong.', '2026-03-28T18:00:00+11:00', 'General Public, Geelong', NULL, 35.00, TRUE),
  ('Pre-Season Training Begins', 'Pre-season training for the 2026/27 season kicks off at the Peter ''Skinny'' Harrison Training Facility, Grinter Reserve. All new and returning players welcome across men''s, women''s, and junior squads.', '2026-08-01T17:30:00+10:00', 'Grinter Reserve, Moolap', NULL, 0.00, TRUE),
  ('Season Launch 2026/27', 'Kick off the new cricket season with the Dinos. Meet the coaches, hear about plans for the season ahead, and register for your team. Free entry. All welcome, including new players and families.', '2026-09-12T14:00:00+10:00', 'Grinter Reserve, Moolap', NULL, 0.00, TRUE);
