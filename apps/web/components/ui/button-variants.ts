import { cva } from 'class-variance-authority'

// Kept out of the 'use client' button module so server components can style a
// <Link> as a button: a client module's exports are references, not callables,
// on the server.
export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent font-data text-xs font-semibold tracking-wider uppercase whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        outline:
          'border-hairline-strong bg-surface-1 text-foreground hover:bg-surface-2 aria-expanded:bg-surface-2',
        secondary: 'bg-surface-2 text-secondary-foreground hover:bg-surface-3',
        ghost:
          'text-muted-foreground hover:bg-surface-2 hover:text-foreground aria-expanded:bg-surface-2',
        livery: 'bg-accent-livery text-background hover:opacity-90',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20',
        link: 'text-primary normal-case tracking-normal underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 px-2 text-2xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 gap-2 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        icon: 'size-8',
        'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-7',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
