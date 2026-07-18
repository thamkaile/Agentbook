import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

gsap.registerPlugin(useGSAP);

export interface RouteRevealProps {
  children: ReactNode;
  className?: string;
}

export function RouteReveal({ children, className = "" }: RouteRevealProps) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    (context, contextSafe) => {
      const target = scope.current;
      if (!target) return;

      const initialize = contextSafe
        ? contextSafe(() => {
            gsap.set(target, { autoAlpha: 1, y: 0 });
          })
        : () => gsap.set(target, { autoAlpha: 1, y: 0 });
      initialize();

      let media: ReturnType<typeof gsap.matchMedia> | undefined;
      // Keep MatchMedia's contexts independent from useGSAP's context. Nesting
      // both context graphs can create a cleanup cycle during route unmount.
      context.ignore(() => {
        media = gsap.matchMedia(scope);
        media.add("(prefers-reduced-motion: reduce)", () => {
          gsap.set(target, { autoAlpha: 1, y: 0 });
        });
        media.add("(prefers-reduced-motion: no-preference)", () => {
          gsap.fromTo(
            target,
            { autoAlpha: 0, y: 8 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.22,
              ease: "power1.out",
              onComplete: () => target.style.removeProperty("transform"),
            },
          );
        });
      });

      return () => media?.revert();
    },
    { scope },
  );

  return (
    <div
      ref={scope}
      className={["route-reveal", className].filter(Boolean).join(" ")}
    >
      {children}
    </div>
  );
}
