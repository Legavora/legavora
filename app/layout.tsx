import './globals.css';import Nav from '@/components/Nav';import Footer from '@/components/Footer';import type {Metadata} from 'next';
export const metadata:Metadata={title:{default:'Legavora | Publishing & Author Growth',template:'%s | Legavora'},description:'Professional author-owned publishing, distribution support and book marketing services for authors worldwide.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className="min-h-screen flex flex-col"><Nav/><main className="flex-1">{children}</main><Footer/></body></html>}
