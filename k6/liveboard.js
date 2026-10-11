import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL || 'http://127.0.0.1';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const response = http.get(`${baseUrl}/api/board`);
  check(response, {
    'board endpoint returns 200': (r) => r.status === 200,
    'response includes columns and cards': (r) => {
      try {
        const body = r.json();
        return Array.isArray(body.columns) && Array.isArray(body.cards);
      } catch (_) {
        return false;
      }
    },
  });
  sleep(1);
}
