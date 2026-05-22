import type { ComponentType } from 'react';
import '../app/globals.css';

type PageAppProps = {
  Component: ComponentType<Record<string, unknown>>;
  pageProps: Record<string, unknown>;
};

export default function App({ Component, pageProps }: PageAppProps) {
  return <Component {...pageProps} />;
}
