import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Maximize2,
  X,
} from "lucide-react";



export function PromoBannerSlider() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const timerRef = useRef(null);

  // High-Resolution Official SHREE 2027 Promo Banners
  const banners = [
    {
      id: 1,
      src: "/images/promo-banner-1.jpg",
      alt: "SHREE 2027 Olympiad - Official Registration Open",
      fit: "cover",
    },
    {
      id: 2,
      src: "/images/promo-banner-2.png",
      alt: "SHREE 2027 Olympiad - Scholarship for All",
      fit: "contain",
    },
    {
      id: 3,
      src: "/images/promo-banner-3.jpg",
      alt: "Join SHREE 2027 Olympiad - Shree Ram Public School",
      fit: "cover",
    },
    {
      id: 4,
      src: "/images/promo-banner-4.png",
      alt: "Join the Olympiad - Learn, Compete, Achieve",
      fit: "cover",
    },
    {
      id: 5,
      src: "/images/promo-banner-5.png",
      alt: "SHREE 2027 Olympiad - Official Registration Open",
      fit: "cover",
    },
  ];

  const totalSlides = banners.length;

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  // Autoplay timer with pause on hover
  useEffect(() => {
    if (isPlaying && !isHovered) {
      timerRef.current = setInterval(() => {
        nextSlide();
      }, 5000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, isHovered, nextSlide]);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === "ArrowLeft") prevSlide();
    if (e.key === "ArrowRight") nextSlide();
  };

  return (
    <div
      className="erp-img-slider-wrapper"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="SHREE 2027 Olympiad Promotional Banners"
    >
      <div className="erp-img-slider-card">
        {/* Sliding Track */}
        <div
          className="erp-img-slider-track"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {banners.map((banner, index) => (
            <div
              key={banner.id}
              className="erp-img-slide"
              aria-hidden={index !== currentSlide}
            >
              {/* Subtle ambient blurred background for panoramic / letterboxed banners */}
              <div
                className="erp-img-slide-ambient"
                style={{ backgroundImage: `url(${banner.src})` }}
              />
              <img
                src={banner.src}
                alt={banner.alt}
                className="erp-img-banner-pic"
                style={{ objectFit: banner.fit || "cover" }}
                loading={index === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>

        {/* Previous Arrow */}
        <button
          type="button"
          className="erp-img-slider-arrow is-left"
          onClick={prevSlide}
          title="Previous Banner"
          aria-label="Previous Banner"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Next Arrow */}
        <button
          type="button"
          className="erp-img-slider-arrow is-right"
          onClick={nextSlide}
          title="Next Banner"
          aria-label="Next Banner"
        >
          <ChevronRight size={24} />
        </button>

        {/* Slide Counter & Play/Pause Badge */}
        <div className="erp-img-slider-counter">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            style={{
              background: "transparent",
              border: 0,
              color: "#FFFFFF",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
            }}
            title={isPlaying ? "Pause slideshow" : "Play slideshow"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <span>
            {currentSlide + 1} / {totalSlides}
          </span>
          <button
            type="button"
            onClick={() => setModalImage(banners[currentSlide])}
            style={{
              background: "transparent",
              border: 0,
              color: "#FFFFFF",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              marginLeft: "4px",
            }}
            title="Expand Fullscreen View"
            aria-label="View Fullscreen"
          >
            <Maximize2 size={12} />
          </button>
        </div>

        {/* Bottom Pagination Dots */}
        <div className="erp-img-slider-pagination">
          {banners.map((b, idx) => (
            <button
              key={b.id}
              type="button"
              className={`erp-img-slider-dot ${idx === currentSlide ? "is-active" : ""}`}
              onClick={() => setCurrentSlide(idx)}
              aria-label={`Jump to banner ${idx + 1}`}
              title={b.alt}
            />
          ))}
        </div>
      </div>

      {/* Fullscreen Lightbox Modal when admin clicks Maximize */}
      {modalImage && (
        <div
          className="erp-img-modal-overlay"
          onClick={() => setModalImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="erp-img-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="erp-img-modal-close"
              onClick={() => setModalImage(null)}
              aria-label="Close"
            >
              <X size={20} />
            </button>
            <img
              src={modalImage.src}
              alt={modalImage.alt}
              className="erp-img-modal-pic"
            />
          </div>
        </div>
      )}
    </div>
  );
}
