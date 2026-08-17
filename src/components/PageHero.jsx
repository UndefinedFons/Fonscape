import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getHeroStyle, PRIMARY_HERO_ORDER } from "../heroImages.js";

let previousPrimaryHero = null;

export function HeroShell({ variant, labelledBy, copyClassName = "", children }) {
  return <section className={`inner-hero inner-hero--${variant}`} aria-labelledby={labelledBy}>
    <RouteHeroArtwork variant={variant} />
    <div className={`inner-hero-copy page-width${copyClassName ? ` ${copyClassName}` : ""}`}>
      {children}
    </div>
  </section>;
}
function RouteHeroArtwork({ variant }) {
  const previousVariant = useRef(previousPrimaryHero).current;
  const previousIndex = PRIMARY_HERO_ORDER.indexOf(previousVariant);
  const currentIndex = PRIMARY_HERO_ORDER.indexOf(variant);
  const direction = previousVariant && previousVariant !== variant
    ? (currentIndex >= previousIndex ? "forward" : "backward")
    : "static";
  const [transitionSettled, setTransitionSettled] = useState(direction === "static");
  useEffect(() => { setTransitionSettled(direction === "static"); }, [direction, variant]);
  useLayoutEffect(() => { previousPrimaryHero = variant; }, [variant]);
  return <div className={`route-hero-art is-${transitionSettled ? "static" : direction}`} aria-hidden="true">{previousVariant && previousVariant !== variant && <span className={`route-hero-art-layer route-hero-art-layer--${previousVariant} is-previous`} style={getHeroStyle(previousVariant)} />}<span className={`route-hero-art-layer route-hero-art-layer--${variant} is-current`} style={getHeroStyle(variant)} onAnimationEnd={() => setTransitionSettled(true)} /></div>;
}

export function PageHero({ kicker, title, description, icon: Icon, variant }) { return <HeroShell variant={variant}><div className="inner-icon"><Icon size={24} /></div><span className="eyebrow">{kicker}</span><h1>{title}</h1><p>{description}</p></HeroShell>; }
