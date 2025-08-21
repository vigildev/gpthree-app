"use client";

import {
  CSSProperties,
  ReactElement,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

interface NeonColorsProps {
  firstColor: string;
  secondColor: string;
}

interface NeonGradientCardProps {
  /**
   * @default <div />
   * @type ReactElement
   * @description
   * The component to be rendered as the card
   * */
  as?: ReactElement;
  /**
   * @default ""
   * @type string
   * @description
   * The className of the card
   */
  className?: string;

  /**
   * @default ""
   * @type ReactNode
   * @description
   * The children of the card
   * */
  children?: ReactNode;

  /**
   * @default 5
   * @type number
   * @description
   * The size of the border in pixels
   * */
  borderSize?: number;

  /**
   * @default 20
   * @type number
   * @description
   * The size of the radius in pixels
   * */
  borderRadius?: number;

  /**
   * @default "{ firstColor: '#ff00aa', secondColor: '#00FFF1' }"
   * @type string
   * @description
   * The colors of the neon gradient
   * */
  neonColors?: NeonColorsProps;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export const NeonGradientCard: React.FC<NeonGradientCardProps> = ({
  className,
  children,
  borderSize = 2,
  borderRadius = 20,
  neonColors = {
    // firstColor: "#ff00aa",
    // secondColor: "#00FFF1",
    firstColor: "#DC1FFF",
    secondColor: "#00FFA3",
  },
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { offsetWidth, offsetHeight } = containerRef.current;
        setDimensions({ width: offsetWidth, height: offsetHeight });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    return () => {
      window.removeEventListener("resize", updateDimensions);
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      const { offsetWidth, offsetHeight } = containerRef.current;
      setDimensions({ width: offsetWidth, height: offsetHeight });
    }
  }, [children]);

  return (
    <div
      ref={containerRef}
      style={
        {
          "--border-size": `${borderSize}px`,
          "--border-radius": `${borderRadius}px`,
          "--neon-first-color": neonColors.firstColor,
          "--neon-second-color": neonColors.secondColor,
          "--card-width": `${dimensions.width}px`,
          "--card-height": `${dimensions.height}px`,
          "--card-content-radius": `${borderRadius - borderSize}px`,
          "--pseudo-element-width": `${dimensions.width + borderSize * 2}px`,
          "--pseudo-element-height": `${dimensions.height + borderSize * 2}px`,
          "--after-blur": `${dimensions.width / 3}px`,
        } as CSSProperties
      }
      className={cn(
        "relative z-10 size-full rounded-[var(--border-radius)]",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "relative size-full min-h-[inherit] rounded-[var(--card-content-radius)] bg-background p-6 border border-border transition-all duration-300",
          "hover:before:absolute hover:before:-left-[var(--border-size)] hover:before:-top-[var(--border-size)] hover:before:-z-10 hover:before:block",
          "hover:before:h-[var(--pseudo-element-height)] hover:before:w-[var(--pseudo-element-width)] hover:before:rounded-[var(--border-radius)] hover:before:content-['']",
          "hover:before:bg-[linear-gradient(0deg,var(--neon-first-color),var(--neon-second-color))] hover:before:bg-[length:100%_200%]",
          "hover:before:animate-background-position-spin",
          "hover:after:absolute hover:after:-left-[var(--border-size)] hover:after:-top-[var(--border-size)] hover:after:-z-10 hover:after:block",
          "hover:after:h-[var(--pseudo-element-height)] hover:after:w-[var(--pseudo-element-width)] hover:after:rounded-[var(--border-radius)] hover:after:blur-[var(--after-blur)] hover:after:content-['']",
          "hover:after:bg-[linear-gradient(0deg,var(--neon-first-color),var(--neon-second-color))] hover:after:bg-[length:100%_200%] hover:after:opacity-80",
          "hover:after:animate-background-position-spin",
          "hover:border-transparent",
          "dark:bg-background"
        )}
      >
        {children}
      </div>
    </div>
  );
};
