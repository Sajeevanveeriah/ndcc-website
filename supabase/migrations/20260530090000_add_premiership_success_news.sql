-- Add the supplied published news article through the existing Supabase-backed news CMS data path.
-- image_url intentionally remains blank so editors can add an image later from /admin/news.

WITH new_article AS (
  SELECT
    'Dinos celebrate senior and junior premiership success'::text AS title,
    'Newcomb & District Cricket Club is proud to celebrate a standout season for the Dinos, highlighted by success across both senior and junior cricket.

The club’s Division 4 1st Eleven capped off a memorable campaign by securing the premiership, a reward for consistent effort, commitment, and belief throughout the season. The result reflects the work put in by the playing group, coaches, volunteers, and supporters who helped drive the team from week to week.

Adding to the achievement, Newcomb & District also claimed the Division 4 Club Championship, recognising the strength and contribution of the club across the grade. It is an achievement that speaks to the depth of the playing group and the positive culture being built around the club.

The future of the Dinos was also on show, with the Under 13 Juniors winning their premiership. Their success is a credit to the players, families, coaches, and junior volunteers who continue to support the next generation of Newcomb & District cricketers.

Together, these achievements mark an important moment for the club. Senior success, junior development, and club-wide recognition all point to a strong foundation heading into the next season.

Congratulations to everyone involved in the Division 4 1st Eleven premiership, the Division 4 Club Championship, and the Under 13 Juniors premiership.'::text AS content,
    'NDCC'::text AS author,
    ''::text AS image_url,
    TRUE::boolean AS published,
    '2026-05-30 09:00:00+10'::timestamptz AS published_at,
    -10::integer AS sort_order
)
INSERT INTO news (title, content, author, image_url, published, published_at, sort_order)
SELECT title, content, author, image_url, published, published_at, sort_order
FROM new_article
WHERE NOT EXISTS (
  SELECT 1 FROM news WHERE title = (SELECT title FROM new_article)
);

NOTIFY pgrst, 'reload schema';
