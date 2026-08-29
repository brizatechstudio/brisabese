import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type NavigateOptions = { replace?: boolean };
type RouterState = { pathname: string; navigate: (to: string, options?: NavigateOptions) => void };

const RouterContext = createContext<RouterState | null>(null);

export function BrowserRouter({ children }: { children: React.ReactNode }) {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string, options: NavigateOptions = {}) => {
    if (to === window.location.pathname) return;
    window.history[options.replace ? 'replaceState' : 'pushState']({}, '', to);
    setPathname(to);
  }, []);

  const value = useMemo(() => ({ pathname, navigate }), [pathname, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter(): RouterState {
  const router = useContext(RouterContext);
  if (!router) throw new Error('Routing hooks must be used inside BrowserRouter.');
  return router;
}

export function useLocation() {
  const { pathname } = useRouter();
  return { pathname };
}

export function useNavigate() {
  return useRouter().navigate;
}

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string };

export function Link({ to, onClick, children, ...props }: LinkProps) {
  const navigate = useNavigate();
  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          !props.target &&
          !event.currentTarget.hasAttribute('download')
        ) {
          event.preventDefault();
          navigate(to);
        }
      }}
    >
      {children}
    </a>
  );
}

export const NavLink = Link;
