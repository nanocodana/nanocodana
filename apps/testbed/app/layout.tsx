export const metadata = {
  title: 'NanoCodana Testbed',
  description: 'Server-client NanoCodana testbed with useChat',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f5f7fb' }}>{children}</body>
    </html>
  )
}
