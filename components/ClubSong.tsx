import Image from 'next/image';

const verses = [
  { title: 'Verse 1', lines: ['The dinosaurs are marching out,', 'Maroon and blue.', 'The dinosaurs are marching out', 'To play for you.'] },
  { title: 'Chorus', lines: ['All the fans begin to shout,', 'We will win without a doubt!', "We'll all be true", 'To the old maroon and blue.'] },
  { title: 'Verse 2', lines: ['The dinosaurs are on the ground,', "We're there to win.", 'We play it hard, we play it fast,', 'We wear a grin.'] },
  { title: 'Chorus / Outro', lines: ['Others may fall by the shores,', 'But not the mighty dinosaurs!', "We'll all be true", 'To the old maroon and blue.'] },
];

export default function ClubSong() {
  return (
    <section id="club-song" aria-labelledby="club-song-title" className="section-padding surface-blue-band scroll-mt-28">
      <div className="container-width">
        <span className="section-eyebrow">Maroon and blue</span>
        <h2 id="club-song-title" className="section-title">Our Club Song</h2>
        <div className="mt-8 grid items-start gap-10 lg:grid-cols-2">
          <div className="space-y-7 font-body text-content-primary">
            {verses.map((verse) => (
              <div key={verse.title}>
                <h3 className="mb-2 text-lg font-bold">{verse.title}</h3>
                <p className="leading-8">
                  {verse.lines.map((line, index) => (
                    <span key={index}>{line}{index < verse.lines.length - 1 && <br />}</span>
                  ))}
                </p>
              </div>
            ))}
          </div>
          <figure className="mx-auto w-full max-w-lg">
            <a href="/downloads/20260919-NDCC-Club-Song-Rev00.png" aria-label="View the full-size club song poster" className="block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current">
              <Image src="/downloads/20260919-NDCC-Club-Song-Rev00.png" alt="NDCC club song poster in maroon and blue with the club crest. Full lyrics are provided alongside." width={2400} height={3400} sizes="(max-width: 1024px) 100vw, 512px" className="h-auto w-full rounded-lg shadow-card" />
            </a>
            <figcaption className="mt-4 flex flex-wrap gap-3">
              <a href="/downloads/20260919-NDCC-Club-Song-Rev00.png" download className="btn-secondary">Download</a>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
