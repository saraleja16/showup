import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <title>ShowUp | Find your game</title>

        <meta
          name="description"
          content="Find people nearby to play sports with, create events and join games with ShowUp."
        />

        {/* Open Graph — LinkedIn, Facebook, WhatsApp */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://showsups.com/" />
        <meta property="og:title" content="ShowUp | Find your game" />
        <meta
          property="og:description"
          content="Find people nearby to play sports with, create events and join games with ShowUp."
        />
        <meta
          property="og:image"
          content="https://showsups.com/showup-preview.png"
        />

        {/* Twitter / X */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="ShowUp | Find your game" />
        <meta
          name="twitter:description"
          content="Find people nearby to play sports with, create events and join games with ShowUp."
        />
        <meta
          name="twitter:image"
          content="https://showsups.com/showup-preview.png"
        />

        <ScrollViewStyleReset />
      </head>

      <body>{children}</body>
    </html>
  );
}