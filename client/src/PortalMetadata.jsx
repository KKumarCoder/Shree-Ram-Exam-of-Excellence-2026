import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { eventBrand, portalRoutes } from './portalData.js';
export function PortalMetadata({
  settings
}) {
  const {
    pathname
  } = useLocation();
  useEffect(() => {
    const brand = eventBrand(settings);
    const info = portalRoutes[pathname] || {
      '/': ['Home', 'Official examination portal of Shree Ram Public School. Explore exam information, registration and candidate services.'],
      '/about': ['About', 'Learn about the school and its Olympiad programme.'],
      '/prizes': ['Prizes', 'Explore published prize categories and award information.'],
      '/scholarships': ['Scholarships', 'Review scholarship information from the school.'],
      '/register': ['Registration', 'Start your secure student application.'],
      '/status': ['Application Status', 'Verify your guardian mobile to access application status and documents.'],
      '/exam-guide': ['Exam Guide', 'Prepare for the examination with school guidance.'],
      '/admin': ['Staff Portal', 'School staff administration.']
    }[pathname] || ['Page not found', 'Explore the official school examination portal.'];
    document.title = pathname === '/' ? `${brand.eventName} | Shree Ram Public School` : `${info[0]} | ${brand.eventName}`;
    const setMeta = (attribute, key, value) => {
      let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
      if (!node) {
        node = document.createElement('meta');
        node.setAttribute(attribute, key);
        document.head.append(node);
      }
      node.content = value;
    };
    setMeta('name', 'description', info[1]);
    setMeta('property', 'og:title', document.title);
    setMeta('property', 'og:description', info[1]);
    setMeta('property', 'og:type', 'website');
    // Exclude queries (which can contain application references) from metadata.
    setMeta('property', 'og:url', `${window.location.origin}${pathname}`);
    setMeta('name', 'robots', ['/admin', '/status', '/register', '/hero-designs'].includes(pathname) ? 'noindex, nofollow' : 'index, follow');
  }, [pathname, settings.eventName, settings.portal?.eventShortName, settings.portal?.eventYear]);
  return null;
}
