'use client';

import { useReportWebVitals } from 'next/web-vitals';

// Issue #1522: Report Core Web Vitals through pluggable sink
export const WebVitals = () => {
  useReportWebVitals((metric) => {
    const vitalsEndpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT;

    if (vitalsEndpoint) {
      // Send via sendBeacon (non-blocking)
      const payload = {
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
        route: typeof window !== 'undefined' ? window.location.pathname : '',
        navigationTime: typeof window !== 'undefined' ? performance.navigation?.type : 0,
      };

      navigator.sendBeacon(vitalsEndpoint, JSON.stringify(payload));
    } else if (process.env.NODE_ENV === 'development') {
      console.log('Web Vital:', metric);
    }
  });

  return null;
};
