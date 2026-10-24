import React, { useEffect, useRef } from 'react';

const NeuralCanvas = ({ isDocumentActive = false, nodeCount = 45 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Mouse tracker
    const mouse = { x: width / 2, y: height / 2, radius: 180 };
    const handleMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Dynamic Nodes / Neurons
    const targetCount = isDocumentActive ? nodeCount + 25 : nodeCount;
    const nodes = [];

    const colors = isDocumentActive 
      ? ['#fbbf24', '#38bdf8', '#818cf8', '#34d399', '#f472b6'] 
      : ['#60a5fa', '#93c5fd', '#38bdf8', '#c084fc'];

    class Node {
      constructor(isHub = false, label = '') {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * (isDocumentActive ? 1.4 : 0.8);
        this.vy = (Math.random() - 0.5) * (isDocumentActive ? 1.4 : 0.8);
        this.radius = isHub ? 7 + Math.random() * 4 : 2 + Math.random() * 3.5;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.isHub = isHub;
        this.label = label;
        this.pulse = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.03 + Math.random() * 0.04;
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;

        // Mouse interaction
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius;
          this.x -= (dx / dist) * force * 3;
          this.y -= (dy / dist) * force * 3;
        }

        this.pulse += this.pulseSpeed;
      }

      draw() {
        ctx.beginPath();
        const currentRadius = this.radius + Math.sin(this.pulse) * 1.5;
        ctx.arc(this.x, this.y, Math.max(1, currentRadius), 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = this.isHub || isDocumentActive ? 15 : 8;
        ctx.shadowColor = this.color;
        ctx.fill();

        if (this.isHub && this.label) {
          ctx.font = '11px Outfit, sans-serif';
          ctx.fillStyle = '#f3f4f6';
          ctx.shadowBlur = 4;
          ctx.shadowColor = '#000000';
          ctx.fillText(this.label, this.x + 12, this.y + 4);
        }
      }
    }

    // Initialize regular neurons
    for (let i = 0; i < targetCount; i++) {
      nodes.push(new Node());
    }

    // Special Hub Neurons if documents are uploaded
    if (isDocumentActive) {
      const hubs = ['IPC Section', 'Contract Clause', 'RAG Embeddings', 'Legal Vector', 'Neural Chunk'];
      hubs.forEach(h => nodes.push(new Node(true, h)));
    }

    // Signal Pulses traveling between neurons
    const pulses = [];
    const createPulse = (n1, n2) => {
      pulses.push({
        x: n1.x,
        y: n1.y,
        tx: n2.x,
        ty: n2.y,
        progress: 0,
        speed: 0.02 + Math.random() * 0.03,
        color: n1.color
      });
    };

    let frame = 0;
    const maxConnDist = isDocumentActive ? 160 : 120;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);
      frame++;

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].update();
        nodes[i].draw();

        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxConnDist) {
            const alpha = (1 - dist / maxConnDist) * (isDocumentActive ? 0.45 : 0.25);
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = isDocumentActive ? `rgba(251, 191, 36, ${alpha})` : `rgba(96, 165, 250, ${alpha})`;
            ctx.lineWidth = isDocumentActive ? 1.2 : 0.8;
            ctx.shadowBlur = isDocumentActive ? 6 : 0;
            ctx.shadowColor = '#fbbf24';
            ctx.stroke();

            // Randomly trigger pulses along active connections
            if (frame % 40 === 0 && Math.random() < 0.08) {
              createPulse(nodes[i], nodes[j]);
            }
          }
        }
      }

      // Draw active traveling signal pulses
      for (let p = pulses.length - 1; p >= 0; p--) {
        const pulse = pulses[p];
        pulse.progress += pulse.speed;
        const curX = pulse.x + (pulse.tx - pulse.x) * pulse.progress;
        const curY = pulse.y + (pulse.ty - pulse.y) * pulse.progress;

        ctx.beginPath();
        ctx.arc(curX, curY, 3, 0, Math.PI * 2);
        ctx.fillStyle = pulse.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = pulse.color;
        ctx.fill();

        if (pulse.progress >= 1) {
          pulses.splice(p, 1);
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isDocumentActive, nodeCount]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-1000 opacity-60"
    />
  );
};

export default NeuralCanvas;
