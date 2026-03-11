import { Footer, Layout, Navbar } from 'nextra-theme-docs';
import { Head } from 'nextra/components';
import { getPageMap } from 'nextra/page-map';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import 'nextra-theme-docs/style.css';

export const metadata: Metadata = {
  title: 'Dittopedia — Documentation',
  description: 'Documentation technique du projet Dittopedia',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={<Navbar logo={<b>Dittopedia Docs</b>} />}
          pageMap={await getPageMap()}
          footer={<Footer>MIT {new Date().getFullYear()} © Dittoploy</Footer>}
        >
          {children}
        </Layout>
      </body>
    </html>
  );
}
