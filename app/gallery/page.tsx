'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';

const galleryItems = [
  { id: 1, title: 'Match Day Action', category: 'Matches', colour: 'from-maroon-200 to-maroon-300' },
  { id: 2, title: 'Training Session', category: 'Training', colour: 'from-maroon-100 to-maroon-200' },
  { id: 3, title: 'Presentation Night', category: 'Social', colour: 'from-maroon-300 to-maroon-400' },
  { id: 4, title: 'Junior Cricket Day', category: 'Juniors', colour: 'from-maroon-100 to-maroon-300' },
  { id: 5, title: 'Club BBQ', category: 'Social', colour: 'from-maroon-200 to-maroon-400' },
  { id: 6, title: 'Grand Final Day', category: 'Matches', colour: 'from-maroon-300 to-maroon-500' },
];

export default function GalleryPage() {
  const [selectedImage, setSelectedImage] = useState<(typeof galleryItems)[number] | null>(null);

  useEffect(() => {
    document.title = 'Gallery | NDCC Dinos';
  }, []);

  return (
    <>
      {/* Hero */}
      <section className="page-hero">
        <div className="container-width">
          <h1 className="page-hero-title">Gallery</h1>
          <p className="page-hero-subtitle">
            Photos and memories from around the club.
          </p>
        </div>
      </section>

      {/* Gallery Grid */}
      <section className="section-padding">
        <div className="container-width">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleryItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedImage(item)}
                className="text-left focus:outline-none focus:ring-2 focus:ring-maroon-500 focus:ring-offset-2 rounded-xl"
                aria-label={`View ${item.title}`}
              >
                <Card hover className="h-full">
                  <div
                    className={`h-56 bg-gradient-to-br ${item.colour} flex items-center justify-center`}
                  >
                    <div className="text-center">
                      <svg
                        className="w-10 h-10 text-maroon-600/50 mx-auto mb-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
                        />
                      </svg>
                      <span className="text-maroon-700/60 font-body text-sm font-medium">
                        {item.title}
                      </span>
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <h3 className="text-lg font-display font-bold text-gray-900">{item.title}</h3>
                    <p className="text-sm text-gray-500 font-body">{item.category}</p>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox Modal */}
      <Modal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        title={selectedImage?.title}
        size="lg"
      >
        {selectedImage && (
          <div>
            <div
              className={`h-80 sm:h-96 bg-gradient-to-br ${selectedImage.colour} rounded-lg flex items-center justify-center mb-4`}
            >
              <div className="text-center">
                <svg
                  className="w-16 h-16 text-maroon-600/40 mx-auto mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
                  />
                </svg>
                <span className="text-maroon-700/50 font-body text-base">
                  Photo placeholder — {selectedImage.title}
                </span>
              </div>
            </div>
            <p className="text-gray-500 font-body text-sm">
              Category: {selectedImage.category}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
