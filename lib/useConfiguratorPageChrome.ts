import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { type SupportedLanguageOption } from '@/lib/configuratorPageOptions';
import { buildTmdbSupportedLanguageOptions } from '@/lib/configuratorLanguageOptions.ts';

export function useConfiguratorPageChrome({
  initialSupportedLanguages,
  tmdbKey,
}: {
  initialSupportedLanguages: SupportedLanguageOption[];
  tmdbKey: string;
}) {
  const pageRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [supportedLanguages, setSupportedLanguages] = useState(initialSupportedLanguages);

  const isNavSticky = useCallback(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const nav = navRef.current;
    if (!nav) {
      return false;
    }
    return window.getComputedStyle(nav).position === 'sticky';
  }, []);

  const scrollToHash = useCallback((hash: string, behavior: ScrollBehavior = 'smooth') => {
    if (typeof window === 'undefined' || !hash || !hash.startsWith('#')) {
      return;
    }
    const target = document.querySelector(hash);
    if (!target) {
      return;
    }
    const navHeight = navRef.current?.getBoundingClientRect().height ?? 0;
    const offset = isNavSticky() ? navHeight + 12 : 16;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);
    window.scrollTo({ top, behavior });
  }, [isNavSticky]);

  const closeMobileNav = useCallback(() => {
    setIsMobileNavOpen(false);
  }, []);

  const toggleMobileNav = useCallback(() => {
    setIsMobileNavOpen((current) => !current);
  }, []);

  const handleAnchorClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const href = event.currentTarget.getAttribute('href');
      if (!href || !href.startsWith('#')) {
        return;
      }
      event.preventDefault();
      closeMobileNav();
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', href);
      }
      scrollToHash(href);
    },
    [closeMobileNav, scrollToHash],
  );

  useEffect(() => {
    if (!tmdbKey || tmdbKey.length <= 10) {
      return;
    }

    Promise.all([
      fetch(`https://api.themoviedb.org/3/configuration/languages?api_key=${tmdbKey}`).then((res) =>
        res.json(),
      ),
      fetch(`https://api.themoviedb.org/3/configuration/primary_translations?api_key=${tmdbKey}`).then(
        (res) => res.json(),
      ),
    ])
      .then(([languages, primaryTranslations]) => {
        if (!Array.isArray(languages)) {
          return;
        }
        const formatted = buildTmdbSupportedLanguageOptions({
          languages,
          primaryTranslations: Array.isArray(primaryTranslations) ? primaryTranslations : [],
        });
        if (formatted.length > 0) {
          setSupportedLanguages(formatted);
        }
      })
      .catch(() => {});
  }, [tmdbKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleHashChange = () => scrollToHash(window.location.hash);
    if (window.location.hash) {
      requestAnimationFrame(() => scrollToHash(window.location.hash, 'auto'));
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [scrollToHash]);

  useEffect(() => {
    if (!isMobileNavOpen || typeof window === 'undefined') {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const nav = navRef.current;
      if (nav && event.target instanceof Node && !nav.contains(event.target)) {
        setIsMobileNavOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };
    const handleViewportChange = () => {
      if (window.innerWidth > 860) {
        setIsMobileNavOpen(false);
      }
    };
    const handleScroll = () => {
      setIsMobileNavOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isMobileNavOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const page = pageRef.current;
    const hero = heroRef.current;
    const nav = navRef.current;
    if (!page || !hero || !nav) {
      return;
    }

    let frame = 0;
    let navResizeObserver: ResizeObserver | null = null;

    const updateCompactProgress = () => {
      frame = 0;
      const navIsSticky = isNavSticky();
      const maxDistance = Math.max(180, Math.min(320, hero.offsetHeight * 0.45));
      const shouldCompactNav = navIsSticky && window.innerWidth < 861;
      const progress = shouldCompactNav
        ? Math.min(1, Math.max(0, window.scrollY / maxDistance))
        : 0;
      page.style.setProperty('--scroll-compact-progress', progress.toFixed(3));
      page.dataset.compactNav = shouldCompactNav && progress > 0.04 ? 'true' : 'false';
      page.style.setProperty(
        '--workspace-sticky-top',
        `${Math.ceil((navRef.current ?? nav).getBoundingClientRect().height + 16)}px`,
      );
    };

    const queueUpdate = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(updateCompactProgress);
    };

    updateCompactProgress();
    window.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate);
    if (typeof ResizeObserver !== 'undefined') {
      navResizeObserver = new ResizeObserver(queueUpdate);
      navResizeObserver.observe(nav);
    }

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      navResizeObserver?.disconnect();
      window.removeEventListener('scroll', queueUpdate);
      window.removeEventListener('resize', queueUpdate);
      page.style.removeProperty('--scroll-compact-progress');
      page.style.removeProperty('--workspace-sticky-top');
      delete page.dataset.compactNav;
    };
  }, [isNavSticky]);

  return {
    closeMobileNav,
    handleAnchorClick,
    heroRef,
    isMobileNavOpen,
    navRef,
    pageRef,
    scrollToHash,
    supportedLanguages,
    toggleMobileNav,
  };
}
