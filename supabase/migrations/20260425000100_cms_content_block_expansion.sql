INSERT INTO content_blocks (block_key, page_slug, section_label, title, body, is_active)
VALUES
  ('home.sponsor_intro', 'home', 'Sponsor intro', 'Our Sponsors', 'Thanks to all local businesses and partners supporting NDCC.', TRUE),
  ('teams.hero', 'teams', 'Teams hero', 'Our Teams', 'Meet the squads representing NDCC across all grades.', TRUE),
  ('teams.coach', 'teams', 'Coach card', 'Head Coach', 'Update this section with current head coach information.', TRUE),
  ('teams.intro', 'teams', 'Team intro', 'Our Squad', 'Team descriptions and grade details.', TRUE),
  ('teams.join_cta', 'teams', 'Join CTA', 'Join a Team', 'Whether you are experienced or new, there is a place for you at NDCC.', TRUE),
  ('events.hero', 'events', 'Events hero', 'Events', 'From presentation nights to fundraisers, stay connected with club events.', TRUE),
  ('events.registration', 'events', 'Events registration guidance', 'Event Registration', 'Register online and follow payment instructions where required.', TRUE),
  ('news.hero', 'news', 'News hero', 'News & Announcements', 'Stay up to date with match reports, updates, and club news.', TRUE),
  ('news.intro', 'news', 'News intro', 'Latest News', 'Read the latest updates from NDCC.', TRUE),
  ('gallery.hero', 'gallery', 'Gallery hero', 'Gallery', 'Match day photos, team shots, and club memories.', TRUE),
  ('gallery.intro', 'gallery', 'Gallery intro', 'Follow Us for More', 'Follow NDCC social channels for more photos and highlights.', TRUE),
  ('sponsors.hero', 'sponsors', 'Sponsors hero', 'Our Sponsors', 'The generous support of sponsors keeps cricket thriving at NDCC.', TRUE),
  ('sponsors.package_guidance', 'sponsors', 'Package guidance', 'Become a Sponsor', 'We offer flexible sponsorship packages for businesses of all sizes.', TRUE),
  ('sponsors.enquiry_intro', 'sponsors', 'Enquiry intro', 'Sponsorship Enquiry', 'Fill out the form below and our sponsorship coordinator will be in touch.', TRUE),
  ('join.playhq', 'join', 'PlayHQ card copy', 'Player Registration', 'Player registrations remain on PlayHQ.', TRUE),
  ('join.social_membership', 'join', 'Social membership copy', 'Social Membership', 'Apply online and pay by bank transfer reference generated at checkout.', TRUE),
  ('volunteer.intro', 'volunteer', 'Volunteer intro', 'Why Volunteer?', 'NDCC is community-run and relies on volunteers.', TRUE),
  ('contact.hero', 'contact', 'Contact hero', 'Contact Us', 'Have a question, want to join, or looking to get involved? We would love to hear from you.', TRUE),
  ('contact.form_intro', 'contact', 'Contact form intro', 'Send Us a Message', 'Fill out the form and the committee will get back to you as soon as possible.', TRUE),
  ('contact.details', 'contact', 'Contact details copy', 'Club Details', 'Ground, email and committee contact details.', TRUE),
  ('kitchen.hero', 'kitchen', 'Kitchen hero', 'Kitchen', 'Order from this week''s canteen menu.', TRUE),
  ('kitchen.menu_intro', 'kitchen', 'Kitchen menu intro', 'Kitchen Menu', 'Weekly menu and item updates.', TRUE),
  ('kitchen.ordering', 'kitchen', 'Kitchen ordering guidance', 'Kitchen Order', 'Select menu items and submit your order.', TRUE),
  ('footer.contact', 'footer', 'Footer contact', 'Contact', 'Get in touch with NDCC via the Contact page.', TRUE),
  ('footer.partner_links', 'footer', 'Footer partner links', 'Partners', 'Useful links for community partners and associations.', TRUE)
ON CONFLICT (block_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
