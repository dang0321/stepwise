import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Stepwise — 파이썬 알고리즘 시각화',
  description:
    '파이썬 코드의 변수, 배열, 호출 스택을 단계별로 재생하고 비교하는 알고리즘 작업 공간.',
  icons: { icon: './favicon.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="dark">
      <body>{children}</body>
    </html>
  );
}
