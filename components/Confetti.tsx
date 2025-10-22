// import React, { useEffect, useRef } from 'react';

// declare global {
//   interface Window {
//     confetti: (opts: any) => void;
//   }
// }

// const Confetti: React.FC = () => {
//   const animationFrameId = useRef<number | null>(null);

//   useEffect(() => {
//     if (typeof window.confetti !== 'function') {
//       console.error("La fonction Confetti n'a pas été trouvée. Avez-vous inclus le script ?");
//       return;
//     }

//     const duration = 1.5 * 1000; // Shorter duration for a quicker celebration
//     const animationEnd = Date.now() + duration;
//     // Reduced velocity and spread for a calmer effect
//     const defaults = { startVelocity: 25, spread: 180, ticks: 60, zIndex: 100 };

//     const frame = () => {
//       const timeLeft = animationEnd - Date.now();

//       if (timeLeft <= 0) {
//         if(animationFrameId.current) {
//             cancelAnimationFrame(animationFrameId.current);
//         }
//         return;
//       }
      
//       // Reduced particle count
//       const particleCount = 10
      
//       // Single, centered origin for a cleaner look
//       window.confetti({ ...defaults, particleCount, origin: { x: 0.5, y: 0.4 } });

//       animationFrameId.current = requestAnimationFrame(frame);
//     };
    
//     frame();

//     return () => {
//       if (animationFrameId.current) {
//         cancelAnimationFrame(animationFrameId.current);
//       }
//     };
//   }, []);

//   return null;
// };

// export default Confetti;




import React, { useEffect } from "react";
import confetti from "canvas-confetti";

const ConfettiBurst: React.FC = () => {
  useEffect(() => {
    // You can tweak these options for different looks
    confetti({
      particleCount: 100,      // how many confetti pieces
      spread: 100,              // how wide the burst spreads
      startVelocity: 45,       // how fast particles shoot out
      origin: { y: 0.45, x: 0.55 },      // vertical position (0 = top, 1 = bottom)
      decay: 0.9,
      // colors: ["#bb0000", "#ffffff", "#00bb00", "#0000bb"], // optional
      zIndex: 9999
    });
  }, []);

  // nothing to render, just fire once
  return null;
};

export default ConfettiBurst;
