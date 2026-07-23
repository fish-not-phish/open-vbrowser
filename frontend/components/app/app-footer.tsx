import Image from 'next/image'
import { Separator } from '@/components/ui/separator'

const links = [
  { label: 'License', href: 'https://github.com/fish-not-phish/open-vbrowser/blob/main/LICENSE' },
  { label: 'Documentation', href: 'https://docs.vbrowser.io/' },
  { label: 'Support', href: 'https://github.com/fish-not-phish/open-vbrowser/issues' },
]

const AppFooter = () => {
  return (
    <footer className="mt-auto bg-card/80 backdrop-blur-sm border-t">
      <Separator />
      <div className="flex items-center justify-between gap-4 px-4 py-3 max-md:flex-col sm:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Image
            src="/images/browsers/vbrowser-16.png"
            alt="vBrowser"
            width={16}
            height={16}
            className="size-4"
          />
          <span>
            &copy;{new Date().getFullYear()}{' '}
            <a href="https://github.com/fish-not-phish/open-vbrowser" className="text-primary hover:underline">
              vBrowser
            </a>
          </span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="hover:text-foreground transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  )
}

export default AppFooter
