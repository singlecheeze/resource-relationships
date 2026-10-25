// Browser-test harness only. Never included in the production plugin.
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
import RelationshipsPage from '../src/components/RelationshipsPage';
(window as any).SERVER_FLAGS = { basePath: '/' };
createRoot(document.getElementById('root')!).render(<RelationshipsPage />);
