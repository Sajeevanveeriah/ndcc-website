-- NDCC Website Seed Data
-- Run this after schema.sql to populate initial data

-- ============================================
-- SPONSORS (2025/26 Season)
-- ============================================

INSERT INTO sponsors (name, tier, website, placement_type, active) VALUES
  ('MBR Cricket', 'major', 'https://mbrcricket.com', 'homepage', TRUE),
  ('Leopold Sportsmans Club', 'gold', 'https://leopoldsporties.com', 'listing', TRUE),
  ('Champion Trophies', 'gold', 'https://www.swlocksmiths.com.au/trophies-giftware/', 'listing', TRUE),
  ('Phoenix Truck Bodies', 'silver', 'https://phoenixtruckbodies.com.au', 'listing', TRUE),
  ('Blackman''s Brewery', 'silver', 'https://www.blackmansbrewery.com.au', 'listing', TRUE);

-- ============================================
-- NEWS
-- ============================================

INSERT INTO news (title, content, author, image_url, published, published_at, sort_order) VALUES
  ('Dinos celebrate senior and junior premiership success', 'Newcomb & District Cricket Club is proud to celebrate a standout season for the Dinos, highlighted by success across both senior and junior cricket.

The club’s Division 4 1st Eleven capped off a memorable campaign by securing the premiership, a reward for consistent effort, commitment, and belief throughout the season. The result reflects the work put in by the playing group, coaches, volunteers, and supporters who helped drive the team from week to week.

Adding to the achievement, Newcomb & District also claimed the Division 4 Club Championship, recognising the strength and contribution of the club across the grade. It is an achievement that speaks to the depth of the playing group and the positive culture being built around the club.

The future of the Dinos was also on show, with the Under 13 Juniors winning their premiership. Their success is a credit to the players, families, coaches, and junior volunteers who continue to support the next generation of Newcomb & District cricketers.

Together, these achievements mark an important moment for the club. Senior success, junior development, and club-wide recognition all point to a strong foundation heading into the next season.

Congratulations to everyone involved in the Division 4 1st Eleven premiership, the Division 4 Club Championship, and the Under 13 Juniors premiership.', 'NDCC', '', TRUE, '2026-05-30 09:00:00+10', -10),
  ('Annual General Meeting - Wednesday 20 May 2026', 'All members are encouraged to attend the Annual General Meeting. Date: Wednesday 20 May 2026. Time: 6:30 pm. Venue: NDCC Club Rooms, 141 Coppards Road, Moolap VIC 3224. Have your say and help shape the future of the club. Your club. Your voice. Be there for the AGM.', 'NDCC Committee', '', TRUE, '2026-05-01 09:00:00+10', 0),
  ('Dino Lotto 2026 is Open', 'Dino Lotto has 50 numbers available at AUD 50 per number. One AUD 100 prize is drawn every Friday at 7:00 pm across a 10 week block, starting when all numbers are sold. Each number remains in every weekly draw. To secure a number, contact ndsc.cricket@gmail.com.', 'NDCC Committee', '', TRUE, '2026-04-30 17:00:00+10', 10),
  ('Apparel Sponsorship 2026/27', 'Put your brand on Newcomb and District apparel and support community cricket in the 2026/27 season. This opportunity is separate from the standard sponsorship packages. Contact John Elliott, President, on 0419 236 866 or ndsc.cricket@gmail.com.', 'NDCC Committee', '', TRUE, '2026-04-29 10:00:00+10', 20),
  ('U13s Reach Grand Final', 'Congratulations to our Under 13s side who secured a spot in the GCA grand final after an undefeated 2025/26 season. The grand final was held at Grinter Reserve, capping off a fantastic season for the junior programme. The boys showed incredible dedication and team spirit throughout the year, and the club could not be prouder of their achievement. A huge thank you to the coaches, parents, and volunteers who supported the team all season.', 'NDCC Committee', '', TRUE, '2026-03-10 10:00:00+11', 30),
  ('2026/27 Season Preview', 'With the 2025/26 season now wrapped up, attention turns to the 2026/27 campaign starting in October 2026. Pre-season training will return to the Peter ''Skinny'' Harrison Training Facility at Grinter Reserve, with sessions for all senior and junior squads. We are encouraging new players across men''s, women''s, and junior cricket to get involved. Registrations will open on PlayHQ closer to the season. Keep an eye on our Facebook page and this website for announcements about training schedules and registration dates.', 'NDCC Committee', '', TRUE, '2026-03-15 08:30:00+11', 40);

-- ============================================
-- EVENTS
-- ============================================

INSERT INTO events (title, description, date, location, capacity, ticket_price, published) VALUES
  ('Annual General Meeting', 'All members are encouraged to attend the Annual General Meeting. Wednesday 20 May 2026, 6:30 pm at NDCC Club Rooms, 141 Coppards Road, Moolap VIC 3224. Have your say and help shape the future of the club. Your club. Your voice. Be there for the AGM.', '2026-05-20T18:30:00+10:00', 'NDCC Club Rooms, 141 Coppards Road, Moolap VIC 3224', NULL, 0.00, TRUE),
  ('Dino Lotto 2026', 'Dino Lotto has 50 numbers at AUD 50 each, with an AUD 100 weekly prize across a 10 week block. Draws are Fridays at 7:00 pm and start when all numbers are sold. Each number stays in every weekly draw. Contact ndsc.cricket@gmail.com to secure a number.', '2026-05-22T19:00:00+10:00', 'Newcomb and District Sports Club, 141 Coppards Road, Moolap VIC 3224', 50, 50.00, TRUE),
  ('Pre-Season Training Begins', 'Pre-season training for the 2026/27 season kicks off at the Peter ''Skinny'' Harrison Training Facility, Grinter Reserve. All new and returning players welcome across men''s, women''s, and junior squads.', '2026-08-01T17:30:00+10:00', 'Grinter Reserve, Moolap', NULL, 0.00, TRUE),
  ('Season Launch 2026/27', 'Kick off the new cricket season with the Dinos. Meet the coaches, hear about plans for the season ahead, and register for your team. Free entry. All welcome, including new players and families.', '2026-09-12T14:00:00+10:00', 'Grinter Reserve, Moolap', NULL, 0.00, TRUE);
