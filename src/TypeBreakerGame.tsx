import React, { useState, useEffect, useRef, useCallback } from 'react';

interface GameState {
  score: number;
  lives: number;
  gameOver: boolean;
  gameWon: boolean;
  paused: boolean;
  letterMode: boolean;
  gameStarted: boolean;
}

interface Paddle {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  speed: number;
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  visible: boolean;
  points: number;
  letter: string;
  isTarget: boolean;
  lastKeyPressTime: number;
}

interface Particle {
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  decay: number;
  gravity: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

const TypeBreakerGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    lives: 10,
    gameOver: false,
    gameWon: false,
    paused: false,
    letterMode: true, // true = letter mode, false = classic mode
    gameStarted: false
  });

  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [targetBrick, setTargetBrick] = useState<Brick | null>(null);
  const [showLetterHint, setShowLetterHint] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  
  // Store particles in a ref for smooth animation
  const particlesRef = useRef<Particle[]>([]);
  
  // Store background stars for smooth animation
  const starsRef = useRef<Star[]>([]);

  // Game constants - different sizes for mobile
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;
  const PADDLE_WIDTH = isMobile ? 120 : 100;
  const PADDLE_HEIGHT = isMobile ? 20 : 15;
  const BALL_SIZE = isMobile ? 16 : 12;
  const BRICK_WIDTH = isMobile ? 90 : 72;
  const BRICK_HEIGHT = isMobile ? 35 : 25;
  const BRICK_ROWS = isMobile ? 5 : 6;
  const BRICK_COLS = isMobile ? 8 : 10;
  const LETTER_PRESS_WINDOW = 500; // milliseconds before ball hits block

  // Game objects
  const gameObjects = useRef<{
    paddle: Paddle;
    ball: Ball;
    bricks: Brick[];
  }>({
    paddle: {
      x: CANVAS_WIDTH / 2 - (isMobile ? 60 : 50),
      y: CANVAS_HEIGHT - 40,
      width: isMobile ? 120 : 100,
      height: isMobile ? 20 : 15,
      speed: 8
    },
    ball: {
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT - 150, // Closer to paddle
      dx: 4,
      dy: -4,
      size: isMobile ? 16 : 12,
      speed: 4
    },
    bricks: []
  });

  // Initialize background stars
  const initializeStars = useCallback((): Star[] => {
    const stars: Star[] = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.3 + 0.1,
        opacity: Math.random() * 0.8 + 0.2
      });
    }
    return stars;
  }, []);
  // Initialize bricks
  const initializeBricks = useCallback((): Brick[] => {
    const bricks: Brick[] = [];
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3'];
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    // Create a shuffled array of letters
    const shuffledLetters = [...letters].sort(() => Math.random() - 0.5);
    
    // Calculate spacing to fit all bricks perfectly
    const totalBrickWidth = BRICK_COLS * BRICK_WIDTH;
    const totalSpacing = CANVAS_WIDTH - totalBrickWidth;
    const spacing = totalSpacing / (BRICK_COLS + 1);
    
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        const letterIndex = (row * BRICK_COLS + col) % shuffledLetters.length;
        bricks.push({
          x: spacing + col * (BRICK_WIDTH + spacing),
          y: row * (BRICK_HEIGHT + 5) + 70, // Changed from 60 to 70 (+10 pixels)
          width: BRICK_WIDTH,
          height: BRICK_HEIGHT,
          color: colors[row],
          visible: true,
          points: (BRICK_ROWS - row) * 10,
          letter: shuffledLetters[letterIndex],
          isTarget: false,
          lastKeyPressTime: 0
        });
      }
    }
    return bricks;
  }, [BRICK_COLS, BRICK_WIDTH, BRICK_HEIGHT, BRICK_ROWS]);

  // Create explosion particles
  const createExplosion = useCallback((brick: Brick) => {
    const particleCount = 12;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 3 + Math.random() * 4;
      
      particlesRef.current.push({
        x: brick.x + brick.width / 2,
        y: brick.y + brick.height / 2,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        color: brick.color,
        life: 1.0,
        maxLife: 1.0,
        decay: 0.008 + Math.random() * 0.004,
        gravity: 0.1
      });
    }
  }, []);

  // Update particles
  const updateParticles = useCallback(() => {
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const particle = particlesRef.current[i];
      
      // Update position
      particle.x += particle.dx;
      particle.y += particle.dy;
      
      // Apply gravity
      particle.dy += particle.gravity;
      
      // Apply air resistance
      particle.dx *= 0.98;
      particle.dy *= 0.98;
      
      // Update life
      particle.life -= particle.decay;
      
      // Remove dead particles
      if (particle.life <= 0) {
        particlesRef.current.splice(i, 1);
      }
    }
  }, []);

  // Update background stars
  const updateStars = useCallback(() => {
    starsRef.current.forEach(star => {
      star.y += star.speed;
      
      // Reset star position when it goes off screen
      if (star.y > CANVAS_HEIGHT) {
        star.y = -star.size;
        star.x = Math.random() * CANVAS_WIDTH;
      }
    });
  }, []);

  // Generate random initial ball velocity
  const getRandomBallVelocity = () => {
    // Random angle between -45 and 45 degrees from vertical
    const minAngle = -Math.PI / 4; // -45 degrees
    const maxAngle = Math.PI / 4;  // 45 degrees
    const angle = minAngle + Math.random() * (maxAngle - minAngle);
    
    const speed = 4;
    return {
      dx: Math.sin(angle) * speed,
      dy: -Math.cos(angle) * speed // Negative to go upward
    };
  };

  // Reset game
  const resetGame = useCallback(() => {
    gameObjects.current.paddle.x = CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2;
    gameObjects.current.paddle.width = PADDLE_WIDTH;
    gameObjects.current.paddle.height = PADDLE_HEIGHT;
    gameObjects.current.ball.x = CANVAS_WIDTH / 2;
    gameObjects.current.ball.y = CANVAS_HEIGHT - 150; // Closer to paddle
    gameObjects.current.ball.size = BALL_SIZE;
    const { dx, dy } = getRandomBallVelocity();
    gameObjects.current.ball.dx = dx;
    gameObjects.current.ball.dy = dy;
    gameObjects.current.bricks = initializeBricks();
    particlesRef.current = [];
    starsRef.current = initializeStars();
    setGameState({
      score: 0,
      lives: 10,
      gameOver: false,
      gameWon: false,
      paused: false,
      letterMode: gameState.letterMode, // Keep current mode when resetting
      gameStarted: true // Keep the game started after reset
    });
  }, [initializeBricks, initializeStars, gameState.letterMode, PADDLE_WIDTH, PADDLE_HEIGHT, BALL_SIZE]);

  // Start game function
  const startGame = useCallback(() => {
    gameObjects.current.paddle.width = PADDLE_WIDTH;
    gameObjects.current.paddle.height = PADDLE_HEIGHT;
    gameObjects.current.paddle.x = CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2;
    gameObjects.current.ball.size = BALL_SIZE;
    gameObjects.current.bricks = initializeBricks();
    starsRef.current = initializeStars();
    const { dx, dy } = getRandomBallVelocity();
    gameObjects.current.ball.dx = dx;
    gameObjects.current.ball.dy = dy;
    setGameState(prev => ({ ...prev, gameStarted: true }));
  }, [initializeBricks, initializeStars, PADDLE_WIDTH, PADDLE_HEIGHT, BALL_SIZE]);

  // Draw functions
  const drawBackground = (ctx: CanvasRenderingContext2D) => {
    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw smoothly moving stars
    ctx.fillStyle = '#ffffff';
    starsRef.current.forEach(star => {
      ctx.save();
      ctx.globalAlpha = star.opacity;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  };

  const drawPaddle = (ctx: CanvasRenderingContext2D) => {
    const paddle = gameObjects.current.paddle;
    
    // Gradient for paddle
    const gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height);
    gradient.addColorStop(0, '#FF6B6B');
    gradient.addColorStop(1, '#E55555');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    
    // Add glow effect
    ctx.shadowColor = '#FF6B6B';
    ctx.shadowBlur = 10;
    ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    ctx.shadowBlur = 0;
  };

  const drawBall = (ctx: CanvasRenderingContext2D) => {
    const ball = gameObjects.current.ball;
    
    // Gradient for ball
    const gradient = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.size);
    gradient.addColorStop(0, '#FECA57');
    gradient.addColorStop(1, '#FF9FF3');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.size, 0, Math.PI * 2);
    ctx.fill();
    
    // Add glow effect
    ctx.shadowColor = '#FECA57';
    ctx.shadowBlur = 15;
    ctx.fill();
    ctx.shadowBlur = 0;
  };

  const drawParticles = (ctx: CanvasRenderingContext2D) => {
    particlesRef.current.forEach(particle => {
      ctx.save();
      
      // Smooth transparency fade
      const alpha = particle.life / particle.maxLife;
      ctx.globalAlpha = alpha;
      
      // Create a glowing effect
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = particle.size * 2;
      
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    });
  };

  const drawBricks = (ctx: CanvasRenderingContext2D) => {
    gameObjects.current.bricks.forEach(brick => {
      if (brick.visible) {
        // Gradient for brick
        const gradient = ctx.createLinearGradient(brick.x, brick.y, brick.x, brick.y + brick.height);
        gradient.addColorStop(0, brick.color);
        gradient.addColorStop(1, brick.color + '88');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        
        // Add border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
        
        // Draw letter in center of brick only in letter mode
        if (gameState.letterMode) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            brick.letter,
            brick.x + brick.width / 2,
            brick.y + brick.height / 2
          );
        }
        
        // Highlight target brick only in letter mode
        if (gameState.letterMode && brick.isTarget) {
          ctx.strokeStyle = '#FFFF00';
          ctx.lineWidth = 3;
          ctx.strokeRect(brick.x - 2, brick.y - 2, brick.width + 4, brick.height + 4);
          
          // Add pulsing glow effect
          ctx.shadowColor = '#FFFF00';
          ctx.shadowBlur = 10;
          ctx.strokeRect(brick.x - 2, brick.y - 2, brick.width + 4, brick.height + 4);
          ctx.shadowBlur = 0;
        }
      }
    });
    
    // Reset text alignment
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  };

  const drawUI = (ctx: CanvasRenderingContext2D, currentGameState: GameState, mobile: boolean) => {
    // Show start screen if game hasn't started
    if (!currentGameState.gameStarted) {
      // Semi-transparent background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Title
      ctx.fillStyle = '#FECA57';
      ctx.font = 'bold 64px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Type Breaker', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 100);
      
      // Subtitle
      ctx.fillStyle = '#4ECDC4';
      ctx.font = '28px Arial';
      ctx.fillText('Learn Touch Typing While Having Fun!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);
      
      // Instructions
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px Arial';
      ctx.fillText('Click "Start Game" to begin', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);
      
      ctx.textAlign = 'left';
      return;
    }
    
    // Normal game UI
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Arial';
    ctx.fillText(`Score: ${currentGameState.score}`, 20, 30);
    ctx.fillText(`Lives: ${currentGameState.lives}`, CANVAS_WIDTH - 120, 30);
    
    // Show game mode
    ctx.fillStyle = '#CCCCCC';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
      `Mode: ${currentGameState.letterMode ? 'Letter Challenge' : 'Classic'}`,
      CANVAS_WIDTH / 2,
      30
    );
    ctx.textAlign = 'left';
    
    // Show letter hint only in letter mode
    if (currentGameState.letterMode && showLetterHint && targetBrick) {
      ctx.fillStyle = '#FFFF00';
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'center';
      if (mobile) {
        ctx.fillText(`Tap the block!`, CANVAS_WIDTH / 2, 60);
      } else {
        ctx.fillText(`Press: ${targetBrick.letter}`, CANVAS_WIDTH / 2, 60);
      }
      ctx.textAlign = 'left';
    }
    
    // Mobile control hint
    if (mobile && currentGameState.gameStarted && !currentGameState.paused) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Tap left/right side to move paddle', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 10);
      ctx.textAlign = 'left';
    }
    
    if (currentGameState.gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = '#FF6B6B';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px Arial';
      ctx.fillText(`Final Score: ${currentGameState.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.fillText('Press R to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
      ctx.textAlign = 'left';
    }
    
    if (currentGameState.gameWon) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = '#4ECDC4';
      ctx.font = '48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('You Win!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px Arial';
      ctx.fillText(`Final Score: ${currentGameState.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.fillText('Press R to restart', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
      ctx.textAlign = 'left';
    }
  };

  // Function to calculate time until ball hits brick
  const calculateTimeToHitBrick = (ball: Ball, brick: Brick): number | null => {
    const ballCenterX = ball.x;
    const ballCenterY = ball.y;
    const ballSpeedX = ball.dx;
    const ballSpeedY = ball.dy;
    
    // Calculate time to reach brick's boundaries
    let timeToHit = Infinity;
    
    // Check horizontal collision
    if (ballSpeedX !== 0) {
      const timeToLeft = (brick.x - ballCenterX) / ballSpeedX;
      const timeToRight = (brick.x + brick.width - ballCenterX) / ballSpeedX;
      
      [timeToLeft, timeToRight].forEach(time => {
        if (time > 0) {
          const futureY = ballCenterY + ballSpeedY * time;
          if (futureY >= brick.y && futureY <= brick.y + brick.height) {
            timeToHit = Math.min(timeToHit, time);
          }
        }
      });
    }
    
    // Check vertical collision
    if (ballSpeedY !== 0) {
      const timeToTop = (brick.y - ballCenterY) / ballSpeedY;
      const timeToBottom = (brick.y + brick.height - ballCenterY) / ballSpeedY;
      
      [timeToTop, timeToBottom].forEach(time => {
        if (time > 0) {
          const futureX = ballCenterX + ballSpeedX * time;
          if (futureX >= brick.x && futureX <= brick.x + brick.width) {
            timeToHit = Math.min(timeToHit, time);
          }
        }
      });
    }
    
    return timeToHit === Infinity ? null : timeToHit * 16.67; // Convert to milliseconds (assuming 60fps)
  };

  // Collision detection
  const checkCollisions = useCallback(() => {
    const ball = gameObjects.current.ball;
    const paddle = gameObjects.current.paddle;
    const currentTime = Date.now();
    
    // Only check letter targeting in letter mode
    if (gameState.letterMode) {
      // Check which brick the ball is heading towards
      let closestBrick: Brick | null = null;
      let closestTime = Infinity;
      
      gameObjects.current.bricks.forEach(brick => {
        if (brick.visible) {
          const timeToHit = calculateTimeToHitBrick(ball, brick);
          if (timeToHit !== null && timeToHit < closestTime && timeToHit <= LETTER_PRESS_WINDOW) {
            closestTime = timeToHit;
            closestBrick = brick;
          }
        }
      });
      
      // Update target brick and show hint
      if (closestBrick !== targetBrick) {
        // Clear previous target
        if (targetBrick) {
          targetBrick.isTarget = false;
        }
        
        // Set new target
        setTargetBrick(closestBrick);
        if (closestBrick) {
          (closestBrick as Brick).isTarget = true;
          setShowLetterHint(true);
        } else {
          setShowLetterHint(false);
        }
      }
    } else {
      // In classic mode, clear any existing targets
      if (targetBrick) {
        targetBrick.isTarget = false;
        setTargetBrick(null);
        setShowLetterHint(false);
      }
    }
    
    // Ball-wall collisions with precise positioning
    if (ball.x - ball.size <= 0) {
      ball.dx = Math.abs(ball.dx); // Force rightward movement
      ball.x = ball.size; // Position exactly at the boundary
    }
    if (ball.x + ball.size >= CANVAS_WIDTH) {
      ball.dx = -Math.abs(ball.dx); // Force leftward movement
      ball.x = CANVAS_WIDTH - ball.size; // Position exactly at the boundary
    }
    if (ball.y - ball.size <= 0) {
      ball.dy = Math.abs(ball.dy); // Force downward movement
      ball.y = ball.size; // Position exactly at the boundary
    }
    
    // Ball-paddle collision
    if (ball.y + ball.size >= paddle.y &&
        ball.y - ball.size <= paddle.y + paddle.height &&
        ball.x >= paddle.x &&
        ball.x <= paddle.x + paddle.width) {
      ball.dy = -Math.abs(ball.dy);
      
      // Add angle based on where ball hits paddle
      const hitPos = (ball.x - paddle.x) / paddle.width;
      ball.dx = ball.speed * (hitPos - 0.5) * 2;
    }
    
    // Ball-brick collisions
    let scoreIncrease = 0;
    gameObjects.current.bricks.forEach(brick => {
      if (brick.visible &&
          ball.x + ball.size >= brick.x &&
          ball.x - ball.size <= brick.x + brick.width &&
          ball.y + ball.size >= brick.y &&
          ball.y - ball.size <= brick.y + brick.height) {
        
        let shouldBreakBrick = false;
        
        if (gameState.letterMode) {
          // Letter mode: check if correct letter was pressed within the time window
          const timeSinceKeyPress = currentTime - brick.lastKeyPressTime;
          const hasCorrectKey = pressedKeys.has(brick.letter);
          const withinTimeWindow = timeSinceKeyPress <= LETTER_PRESS_WINDOW;
          
          // Debug: You can uncomment these to see what's happening
          // console.log(`Brick ${brick.letter}: timeSince=${timeSinceKeyPress}, hasKey=${hasCorrectKey}, withinWindow=${withinTimeWindow}`);
          
          if (hasCorrectKey && withinTimeWindow) {
            shouldBreakBrick = true;
          }
        } else {
          // Classic mode: always break brick on collision
          shouldBreakBrick = true;
        }
        
        if (shouldBreakBrick) {
          // Break the brick with explosion effect
          brick.visible = false;
          scoreIncrease += brick.points;
          
          // Create explosion animation
          createExplosion(brick);
          
          // Clear target if this was the target brick
          if (brick === targetBrick) {
            setTargetBrick(null);
            setShowLetterHint(false);
          }
        }
        
        // Always bounce the ball off the brick (whether broken or not)
        // More precise collision detection and response
        const ballLeft = ball.x - ball.size;
        const ballRight = ball.x + ball.size;
        const ballTop = ball.y - ball.size;
        const ballBottom = ball.y + ball.size;
        
        const brickLeft = brick.x;
        const brickRight = brick.x + brick.width;
        const brickTop = brick.y;
        const brickBottom = brick.y + brick.height;
        
        // Calculate overlaps
        const overlapLeft = ballRight - brickLeft;
        const overlapRight = brickRight - ballLeft;
        const overlapTop = ballBottom - brickTop;
        const overlapBottom = brickBottom - ballTop;
        
        // Find the smallest overlap to determine collision side
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        
        // Respond based on the side with minimum overlap
        if (minOverlap === overlapLeft) {
          // Ball hit brick from the left
          ball.dx = -Math.abs(ball.dx); // Force leftward movement
          ball.x = brickLeft - ball.size - 1; // Position ball to the left of brick
        } else if (minOverlap === overlapRight) {
          // Ball hit brick from the right
          ball.dx = Math.abs(ball.dx); // Force rightward movement
          ball.x = brickRight + ball.size + 1; // Position ball to the right of brick
        } else if (minOverlap === overlapTop) {
          // Ball hit brick from the top
          ball.dy = -Math.abs(ball.dy); // Force upward movement
          ball.y = brickTop - ball.size - 1; // Position ball above brick
        } else if (minOverlap === overlapBottom) {
          // Ball hit brick from the bottom
          ball.dy = Math.abs(ball.dy); // Force downward movement
          ball.y = brickBottom + ball.size + 1; // Position ball below brick
        }
        
        brick.isTarget = false;
      }
    });
    
    if (scoreIncrease > 0) {
      setGameState(prev => ({ ...prev, score: prev.score + scoreIncrease }));
    }
    
    // Check if ball fell off screen
    if (ball.y > CANVAS_HEIGHT) {
      setGameState(prev => {
        const newLives = prev.lives - 1;
        if (newLives <= 0) {
          return { ...prev, lives: 0, gameOver: true };
        }
        return { ...prev, lives: newLives };
      });
      
      // Reset ball position with random velocity
      ball.x = CANVAS_WIDTH / 2;
      ball.y = CANVAS_HEIGHT - 150; // Closer to paddle
      const { dx, dy } = getRandomBallVelocity();
      ball.dx = dx;
      ball.dy = dy;
      
      // Clear target
      setTargetBrick(null);
      setShowLetterHint(false);
    }
    
    // Check win condition
    const visibleBricks = gameObjects.current.bricks.filter(brick => brick.visible);
    if (visibleBricks.length === 0) {
      setGameState(prev => ({ ...prev, gameWon: true }));
    }
  }, [targetBrick, pressedKeys, createExplosion, gameState.letterMode]);

  // Main game loop
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Always draw background and UI
    drawBackground(ctx);
    
    // Only draw game elements if game has started
    if (gameState.gameStarted) {
      drawBricks(ctx);
      drawParticles(ctx);
      drawPaddle(ctx);
      drawBall(ctx);
    }
    
    // Always draw UI (handles both start screen and game UI)
    drawUI(ctx, gameState, isMobile);
    
    // Update game state only if game has started and not paused
    if (gameState.gameStarted && !gameState.paused && !gameState.gameOver && !gameState.gameWon) {
      const paddle = gameObjects.current.paddle;
      const ball = gameObjects.current.ball;
      
      // Update paddle position
      if (keysRef.current['ArrowLeft'] && paddle.x > 0) {
        paddle.x -= paddle.speed;
      }
      if (keysRef.current['ArrowRight'] && paddle.x < CANVAS_WIDTH - paddle.width) {
        paddle.x += paddle.speed;
      }
      
      // Update ball position
      ball.x += ball.dx;
      ball.y += ball.dy;
      
      // Update background stars
      updateStars();
      
      // Check collisions
      checkCollisions();
    }
    
    // Update particles even when paused for smooth animation
    updateParticles();
    
    // Update stars even when game hasn't started for animated background
    if (!gameState.gameStarted || gameState.paused) {
      updateStars();
    }
    
    // Continue loop
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameState, checkCollisions, updateParticles, updateStars]);

  // Event handlers
  const handleKeyDown = (e: KeyboardEvent) => {
    keysRef.current[e.code] = true;
    
    if (e.code === 'KeyR' && (gameState.gameOver || gameState.gameWon)) {
      resetGame();
    }
    if (e.code === 'Space') {
      e.preventDefault();
      setGameState(prev => ({ ...prev, paused: !prev.paused }));
    }
    
    // Toggle game mode with '0' key
    if (e.code === 'Digit0') {
      setGameState(prev => ({ ...prev, letterMode: !prev.letterMode }));
      // Clear any existing targets when switching modes
      if (targetBrick) {
        targetBrick.isTarget = false;
        setTargetBrick(null);
        setShowLetterHint(false);
      }
    }
    
    // Handle letter key presses (only in letter mode)
    if (gameState.letterMode && e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
      const letter = e.key.toUpperCase();
      setPressedKeys(prev => new Set([...prev, letter]));
      
      // Update the time when this key was pressed for all matching bricks
      const currentTime = Date.now();
      gameObjects.current.bricks.forEach(brick => {
        if (brick.letter === letter) {
          brick.lastKeyPressTime = currentTime;
        }
      });
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    keysRef.current[e.code] = false;
    
    // Handle letter key releases (only in letter mode)
    if (gameState.letterMode && e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
      const letter = e.key.toUpperCase();
      setPressedKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(letter);
        return newSet;
      });
    }
  };

  // Touch event handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!gameState.gameStarted || gameState.paused || gameState.gameOver || gameState.gameWon) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / canvasScale;
    const y = (touch.clientY - rect.top) / canvasScale;
    
    // Check if touch is in bottom area for paddle control
    if (y > CANVAS_HEIGHT - 200) {
      const paddle = gameObjects.current.paddle;
      const targetX = x < CANVAS_WIDTH / 2 ? 
        Math.max(0, paddle.x - 30) : 
        Math.min(CANVAS_WIDTH - paddle.width, paddle.x + 30);
      paddle.x = targetX;
    } else if (gameState.letterMode && isMobile) {
      // Check if touch is on a brick
      gameObjects.current.bricks.forEach(brick => {
        if (brick.visible && brick.isTarget &&
            x >= brick.x && x <= brick.x + brick.width &&
            y >= brick.y && y <= brick.y + brick.height) {
          // Mark brick as pressed
          const currentTime = Date.now();
          brick.lastKeyPressTime = currentTime;
          setPressedKeys(new Set([brick.letter]));
        }
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!gameState.gameStarted || gameState.paused || gameState.gameOver || gameState.gameWon) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / canvasScale;
    const y = (touch.clientY - rect.top) / canvasScale;
    
    // Only move paddle if touching in the control area
    if (y > CANVAS_HEIGHT - 200) {
      const paddle = gameObjects.current.paddle;
      // Tap to move instead of drag
      const targetX = x < CANVAS_WIDTH / 2 ? 
        Math.max(0, paddle.x - 30) : 
        Math.min(CANVAS_WIDTH - paddle.width, paddle.x + 30);
      paddle.x = targetX;
    }
  };

  const handleTouchEnd = () => {
    if (isMobile && gameState.letterMode) {
      setPressedKeys(new Set());
    }
  };

  // Detect mobile and handle resize
  useEffect(() => {
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                     window.innerWidth < 768;
      setIsMobile(mobile);
      
      // Calculate scale to fit canvas on screen
      const maxWidth = window.innerWidth - 32; // 16px padding on each side
      const maxHeight = window.innerHeight - 200; // Space for UI elements
      const scaleX = maxWidth / CANVAS_WIDTH;
      const scaleY = maxHeight / CANVAS_HEIGHT;
      const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
      setCanvasScale(scale);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize game
  useEffect(() => {
    gameObjects.current.bricks = initializeBricks();
    starsRef.current = initializeStars();
    
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [initializeBricks, initializeStars]);

  // Start game loop when game state changes
  useEffect(() => {
    if (gameLoopRef.current) {
      cancelAnimationFrame(gameLoopRef.current);
    }
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameLoop]);

  // Event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState.gameOver, gameState.gameWon, gameState.letterMode, targetBrick, resetGame]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="mb-4 text-white text-center">
        <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-600">
          Type Breaker
        </h1>
        {gameState.gameStarted && (
          <>
            {isMobile ? (
              <>
                <p className="text-lg mb-2">Tap left/right side to move paddle</p>
                <p className="text-sm mb-1">Letter Mode: Tap the highlighted block before the ball hits it!</p>
                <p className="text-sm mb-1">Classic Mode: Just break blocks with the ball!</p>
              </>
            ) : (
              <>
                <p className="text-lg mb-2">Use ← → arrow keys to move paddle</p>
                <p className="text-sm mb-1">Letter Mode: Press the letter on each block just before the ball hits it!</p>
                <p className="text-sm mb-1">Classic Mode: Just break blocks with the ball!</p>
                <p className="text-sm">Press 0 to switch modes • Press SPACE to pause • Press R to restart when game ends</p>
              </>
            )}
          </>
        )}
      </div>
      
      <div className="relative" style={{ transform: `scale(${canvasScale})`, transformOrigin: 'top center' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="border-2 border-purple-500 rounded-lg shadow-2xl"
          tabIndex={0}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: 'none' }}
        />
        
        {gameState.paused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg">
            <div className="text-white text-3xl font-bold">PAUSED</div>
          </div>
        )}
        
        {!gameState.gameStarted && (
          <div className="absolute inset-0 flex items-end justify-center pb-20">
            <button
              onClick={startGame}
              className="px-8 py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xl rounded-lg shadow-lg hover:from-pink-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
            >
              Start Game
            </button>
          </div>
        )}
        
        {isMobile && (gameState.gameOver || gameState.gameWon) && (
          <div className="absolute inset-0 flex items-end justify-center pb-20">
            <button
              onClick={resetGame}
              className="px-8 py-4 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xl rounded-lg shadow-lg hover:from-pink-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
            >
              Restart
            </button>
          </div>
        )}
      </div>
      
      {gameState.gameStarted && (
        <div className="mt-4 text-white text-center">
          <div className="grid grid-cols-3 gap-8 text-lg">
            <div>Score: <span className="font-bold text-yellow-400">{gameState.score}</span></div>
            <div>Lives: <span className="font-bold text-red-400">{gameState.lives}</span></div>
            <div>Level: <span className="font-bold text-blue-400">1</span></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TypeBreakerGame;