import Link from 'next/link';
import {ArrowUpRight, Facebook, Instagram, Linkedin, Youtube, Mail, ArrowRight} from 'lucide-react';
import {socialLinks} from '@/lib/socials';

const navigation = [
  {title:'PUBLISHING',links:[['/publish','Publish with Legavora'],['/services','Publishing services'],['/books','Our books'],['/portfolio','Creative portfolio']]},
  {title:'GROWTH',links:[['/programs','Author growth programs'],['/services','Book marketing'],['/insights','Insights & resources']]},
  {title:'COMPANY',links:[['/about','About Legavora'],['/contact','Contact us'],['/login','Author portal']]},
] as const;
const policies = [['/privacy','Privacy'],['/terms','Terms'],['/refunds','Refunds'],['/payments-policy','Payments'],['/publishing-policy','Publishing terms'],['/cookies','Cookies'],['/copyright','Copyright'],['/accessibility','Accessibility']] as const;
const icons:Record<string,typeof Facebook> = {Facebook,Instagram,LinkedIn:Linkedin,YouTube:Youtube};

export default function Footer(){
 return <footer className="legavora-footer">
   <div className="container lf-cta">
     <div><p className="lf-eyebrow">YOUR NEXT CHAPTER STARTS HERE</p><h2>Great stories deserve<br/><em>a global stage.</em></h2><p>From manuscript to marketplace, build what comes next with a publishing partner focused on your ambitions.</p></div>
     <Link className="lf-cta-button" href="/contact">Start your publishing journey <ArrowUpRight size={19}/></Link>
   </div>
   <div className="container lf-main">
     <div className="lf-identity">
       <Link href="/" className="lf-wordmark" aria-label="Legavora homepage">LEGAVORA<span>.</span></Link>
       <p className="lf-tagline">Your Book. Your Rights.<br/>Your Royalties.</p>
       <p className="lf-description">Publishing, distribution support, creative production and author growth solutions for a worldwide audience.</p>
       <div className="lf-social" aria-label="Official social media">
         {socialLinks.filter(s=>s.url).map(s=>{const Icon=icons[s.name];return <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`Legavora on ${s.name}`}>{Icon?<Icon size={18}/>:<span>{s.name}</span>}</a>})}
       </div>
     </div>
     <div className="lf-navigation">
       {navigation.map(group=><nav key={group.title} aria-label={group.title}><h3>{group.title}</h3>{group.links.map(([url,title])=><Link href={url} key={url+title}>{title}</Link>)}</nav>)}
     </div>
     <div className="lf-contact"><h3>LET'S CONNECT</h3><p>Publishing inquiries & partnerships</p><a href="mailto:hello@legavora.com">hello@legavora.com <ArrowUpRight size={14}/></a><p>Client support & project assistance</p><a href="mailto:legavora@gmail.com">legavora@gmail.com <ArrowUpRight size={14}/></a><Link href="/contact" className="lf-contact-link">Contact Legavora <ArrowRight size={16}/></Link></div>
   </div>
   <div className="container lf-legal"><div className="lf-policy-links">{policies.map(([url,title])=><Link key={url} href={url}>{title}</Link>)}</div><div className="lf-bottom"><span>© {new Date().getFullYear()} Legavora Global Services Ltd. All rights reserved.</span><span>Legavora Global Services Ltd · Registered Company · RC 10009828</span></div></div>
 </footer>
}
