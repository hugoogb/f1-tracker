'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavigationMenu } from '@base-ui/react/navigation-menu'
import { ChevronDown } from 'lucide-react'

import { NAV_GROUPS, activeGroup, isActiveHref } from '@/lib/nav'
import { cn } from '@/lib/utils'

const triggerClass =
  'font-data text-muted-foreground hover:text-foreground data-[popup-open]:text-foreground focus-ring relative inline-flex h-14 items-center gap-1 px-3 text-xs font-semibold tracking-wider whitespace-nowrap uppercase transition-colors'

const activeClass =
  'text-foreground after:bg-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5'

/** The desktop header navigation: plain links, and groups that open a panel. */
export function MainNav() {
  const pathname = usePathname()
  const current = activeGroup(pathname)

  return (
    <NavigationMenu.Root className="hidden lg:block" aria-label="Main">
      <NavigationMenu.List className="flex items-center">
        {NAV_GROUPS.map((group) => {
          const active = group.label === current
          if (!group.items) {
            return (
              <NavigationMenu.Item key={group.label}>
                <NavigationMenu.Link
                  render={<Link href={group.href!} />}
                  aria-current={active ? 'page' : undefined}
                  className={cn(triggerClass, active && activeClass)}
                >
                  {group.label}
                </NavigationMenu.Link>
              </NavigationMenu.Item>
            )
          }
          return (
            <NavigationMenu.Item key={group.label}>
              <NavigationMenu.Trigger className={cn(triggerClass, active && activeClass)}>
                {group.label}
                <NavigationMenu.Icon className="transition-transform data-[popup-open]:rotate-180">
                  <ChevronDown className="size-3" aria-hidden />
                </NavigationMenu.Icon>
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="w-80 p-2">
                <ul className="grid gap-0.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <NavigationMenu.Link
                        render={<Link href={item.href} />}
                        aria-current={isActiveHref(pathname, item.href) ? 'page' : undefined}
                        className="hover:bg-surface-2 focus-ring block px-3 py-2"
                      >
                        <span className="font-data block text-sm font-semibold tracking-wide uppercase">
                          {item.label}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {item.description}
                        </span>
                      </NavigationMenu.Link>
                    </li>
                  ))}
                </ul>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          )
        })}
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner sideOffset={0} align="start" className="z-50">
          <NavigationMenu.Popup className="brackets bg-surface-1 border-hairline-strong border">
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  )
}
