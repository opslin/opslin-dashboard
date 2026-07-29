"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

export function useScrollReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let hasRevealed = false;
    let observer: IntersectionObserver;

    const reveal = () => {
      if (hasRevealed) return;
      hasRevealed = true;
      element.classList.add("visible");
      if (
        window.matchMedia("(max-width: 767px)").matches ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        gsap.set(element, { autoAlpha: 1, y: 0, filter: "blur(0px)", clearProps: "transform,filter" });
        observer?.unobserve(element);
        return;
      }
      const delay = Number(element.dataset.revealDelay ?? 0) / 1000;
      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 34, filter: "blur(10px)" },
        {
          autoAlpha: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.9,
          delay,
          ease: "power3.out",
          overwrite: "auto",
        }
      );
      observer?.unobserve(element);
    };

    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          reveal();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    observer.observe(element);

    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      requestAnimationFrame(reveal);
    }

    return () => observer.disconnect();
  }, []);

  return ref;
}
