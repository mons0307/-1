import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"마음 한 줄 · 감사일기",description:"초등학생을 위한 3단계 감사일기",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ko"><body>{children}</body></html>}
