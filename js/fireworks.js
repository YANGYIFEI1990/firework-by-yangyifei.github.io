// ==================== 声音系统（终极优化：随机音效参数+音频池） ====================
let isMuted = false;
let masterVolume = 0.6;

// 音频文件路径
const soundFiles = {
  launch: 'audio/launch.mp3',
  explosion: 'audio/explosion.mp3',
  sparkle: 'audio/sparkle.mp3'
};

// 音频池：每个音效预创建多个实例，避免连续播放被截断
const audioPool = {
  launch: [],
  explosion: [],
  sparkle: []
};
const POOL_SIZE = 4; // 减少池大小，避免过度叠加（原6个→4个）

// 预加载音频池
function preloadSounds() {
  Object.keys(soundFiles).forEach(key => {
    for (let i = 0; i < POOL_SIZE; i++) {
      const audio = new Audio(soundFiles[key]);
      audio.volume = masterVolume;
      audioPool[key].push(audio);
    }
  });
}

// 初始化音频系统
function initAudio() {
  if (audioPool.launch.length === 0) preloadSounds();
}

// 从池里取一个可播放的音频（优化：优先选播放完的，减少复用生硬）
function getAvailableAudio(key) {
  for (let audio of audioPool[key]) {
    // 优先选完全播放完或未播放的，避免中途截断
    if (audio.paused && audio.currentTime === 0) {
      return audio;
    }
  }
  // 无可用则选播放进度>80%的，减少生硬感
  for (let audio of audioPool[key]) {
    if (audio.currentTime / (audio.duration || 1) > 0.8) {
      audio.currentTime = 0;
      return audio;
    }
  }
  // 最后才强制复用第一个
  const audio = audioPool[key][0];
  audio.currentTime = 0;
  return audio;
}

// 播放声音（优化：给sparkle加随机参数，避免机械重复）
function playSound(soundName) {
  if (isMuted) return;
  const audio = getAvailableAudio(soundName);
  if (audio) {
    // 仅给噼啪声加随机音量/速率，模拟真实细碎声
    if (soundName === 'sparkle') {
      audio.volume = masterVolume * (0.7 + Math.random() * 0.3); // 0.7~1倍音量
      audio.playbackRate = 0.9 + Math.random() * 0.2; // 0.9~1.1倍速率
    } else {
      audio.volume = masterVolume;
      audio.playbackRate = 1;
    }
    audio.play().catch(() => {});
  }
}

// 播放烟花升空呼啸声
function playLaunchSound() {
  playSound('launch');
}

// 播放爆炸声
function playExplosionSound() {
  playSound('explosion');
}

// 播放闪烁/噼啪声（新增：需传入烟花实例，绑定生命周期）
function playSparkleSound(firework) {
  // 仅当烟花的噼啪声未超时，才播放
  if (firework && firework.isSparkleAllowed) {
    playSound('sparkle');
  }
}

// ==================== 原有功能（核心优化：绑定音效和粒子生命周期） ====================

// 1. 生成星星背景
const starsContainer = document.getElementById("stars");
const starCount = 150;
for (let i = 0; i < starCount; i++) {
  const star = document.createElement("div");
  star.classList.add("star");
  star.style.left = `${Math.random() * 100}vw`;
  star.style.top = `${Math.random() * 100}vh`;
  star.style.width = `${Math.random() * 2 + 1}px`;
  star.style.height = star.style.width;
  star.style.setProperty("--d", `${Math.random() * 3 + 2}s`);
  starsContainer.appendChild(star);
}

// 2. 全屏按钮功能
const fullscreenBtn = document.getElementById("fullscreenBtn");
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.log(`全屏请求失败: ${err.message}`);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
});

// 3. 静音按钮功能
const muteBtn = document.getElementById("muteBtn");
if (muteBtn) {
  muteBtn.addEventListener("click", () => {
    initAudio();
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? "🔇" : "🔊";
    muteBtn.style.opacity = isMuted ? "0.5" : "1";
  });
}

// 4. 烟花核心逻辑
const canvas = document.getElementById("fireworksCanvas");
const ctx = canvas.getContext("2d");

// 适配窗口大小
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// 存储烟花弹和粒子
let fireworks = [];
let particles = [];

// 烟花弹类（升空阶段：新增噼啪声生命周期控制）
class Firework {
  constructor(x, y) {
    this.x = x;
    this.y = canvas.height;
    this.targetY = y;
    this.speed = Math.random() * 2 + 2;
    this.acceleration = 0.03;
    this.color = `hsl(${Math.random() * 360}, 90%, 70%)`;
    this.size = 4;
    this.exploded = false;
    this.trail = [];
    this.maxTrailLength = 20;
    this.jitterLayers = [
      { phase: Math.random() * Math.PI * 2, speed: 0.08 + Math.random() * 0.05, amp: 2 + Math.random() * 2 },
      { phase: Math.random() * Math.PI * 2, speed: 0.15 + Math.random() * 0.1, amp: 1 + Math.random() * 1.5 },
      { phase: Math.random() * Math.PI * 2, speed: 0.25 + Math.random() * 0.15, amp: 0.5 + Math.random() * 0.8 }
    ];
    this.baseX = x;
    this.currentX = x;
    this.velocityX = 0;

    // 新增：噼啪声控制参数
    this.isSparkleAllowed = false; // 初始不允许触发噼啪声
    this.sparkleTimer = null; // 控制噼啪声总时长
    this.SPARKLE_DURATION = 800; // 单烟花噼啪声最长800ms（和粒子生命周期匹配）

    // 播放升空声音
    playLaunchSound();
  }

  update() {
    this.speed += this.acceleration;
    this.y -= this.speed;

    let jitterOffset = 0;
    this.jitterLayers.forEach(layer => {
      layer.phase += layer.speed;
      jitterOffset += Math.sin(layer.phase) * layer.amp;
    });
    jitterOffset += (Math.random() - 0.5) * 0.8;

    const targetX = this.baseX + jitterOffset;
    this.currentX += (targetX - this.currentX) * 0.15;
    this.x = this.currentX;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrailLength) {
      this.trail.shift();
    }

    if (this.y <= this.targetY) {
      this.explode();
      this.exploded = true;
    }
  }

  draw() {
    ctx.save();

    if (this.trail.length > 1) {
      for (let i = 0; i < this.trail.length; i++) {
        const point = this.trail[i];
        const progress = i / this.trail.length;

        if (Math.random() > 0.7 && i < this.trail.length - 3) continue;

        const alpha = progress * 0.5 * (0.8 + Math.random() * 0.4);
        const size = progress * this.size * (0.6 + Math.random() * 0.4);

        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 6 + Math.random() * 6;
        ctx.shadowColor = this.color;

        ctx.beginPath();
        ctx.arc(point.x, point.y, size > 0.3 ? size : 0.3, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        if (Math.random() > 0.6) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, size * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 12 + Math.random() * 6;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    ctx.restore();
  }

  explode() {
    // 播放爆炸声音
    playExplosionSound();

    // 优化1：爆炸后立即触发第一声噼啪，无延迟
    setTimeout(() => {
      playSparkleSound(this);
    }, Math.random() * 20);

    // 优化2：开启噼啪声触发权限，800ms后关闭（和粒子生命周期匹配）
    this.isSparkleAllowed = true;
    this.sparkleTimer = setTimeout(() => {
      this.isSparkleAllowed = false;
      clearTimeout(this.sparkleTimer);
    }, this.SPARKLE_DURATION);

    const particleCount = 150;
    const style = Math.floor(Math.random() * 5);

    for (let i = 0; i < particleCount; i++) {
      let angle, speed, decay, size, color;

      if (style === 0) {
        angle = Math.random() * Math.PI * 2;
        speed = Math.random() * 3 + 1;
        decay = Math.random() * 0.006 + 0.003;
        size = 2.5;
        color = `hsl(${parseInt(this.color.match(/\d+/)[0]) + Math.random() * 20 - 10}, 95%, 75%)`;
      } else if (style === 1) {
        const t = Math.random() * Math.PI * 2;
        angle = t;
        const r = 16 * Math.pow(Math.sin(t), 3);
        speed = (Math.random() * 2 + 0.5) * (r / 16 + 0.5);
        decay = Math.random() * 0.005 + 0.004;
        size = 2.2;
        color = `hsl(${340 + Math.random() * 20}, 100%, 80%)`;
      } else if (style === 2) {
        const spiralFactor = 0.08;
        angle = Math.random() * Math.PI * 2 + i * spiralFactor;
        speed = Math.random() * 4 + 0.5;
        decay = Math.random() * 0.005 + 0.003;
        size = 2.0;
        color = `hsl(${200 + Math.random() * 30}, 95%, 75%)`;
      } else if (style === 3) {
        angle = Math.random() * Math.PI * 2;
        speed = Math.random() * 3 + 1.5;
        decay = Math.random() * 0.005 + 0.003;
        size = 2.0;
        color = `hsl(${60 + Math.random() * 30}, 100%, 80%)`;
        if (i % 2 === 0) {
          particles.push(
            new Particle(
              this.x,
              this.y,
              angle,
              speed / 2,
              decay * 1.1,
              1.5,
              color,
              this // 把烟花实例传给粒子，绑定音效
            ),
          );
        }
      } else if (style === 4) {
        angle = Math.random() * Math.PI * 2;
        speed = Math.random() * 3 + 0.5;
        decay = Math.random() * 0.005 + 0.003;
        size = 2.0;
        color = `hsl(${Math.random() * 360}, 95%, 80%)`;
      }

      // 把烟花实例传给粒子，绑定音效
      particles.push(
        new Particle(this.x, this.y, angle, speed, decay, size, color, this),
      );
    }
  }
}

// 烟花粒子类（核心优化：音效触发和粒子alpha绑定）
class Particle {
  constructor(x, y, angle, speed, decay, size, color, firework) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = speed;
    this.gravity = 0.01;
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.alpha = 1;
    this.decay = decay;
    this.size = size;
    this.color = color;
    this.firework = firework; // 绑定所属的烟花实例
  }

  update() {
    this.vx *= 0.995;
    this.vy *= 0.995;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay * (1 - this.alpha / 2);

    // 优化3：音效触发概率和粒子alpha强绑定（核心！）
    // alpha越高（粒子越亮），触发概率越高；alpha<0.2时完全不触发
    if (this.alpha > 0.2 && this.firework) {
      // 基础概率降低到0.015，随alpha动态提升（alpha=1时概率≈0.045）
      const dynamicProbability = 0.015 * (this.alpha / 0.3);
      if (Math.random() < dynamicProbability) {
        playSparkleSound(this.firework);
      }
    }
  }

  draw() {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.color;
    ctx.restore();
  }
}

// 生成单枚烟花
function createFirework(x, y) {
  fireworks.push(new Firework(x, y));
}

// 生成随机烟花
function createRandomFireworks(count = 1) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const x = Math.random() * (canvas.width - 200) + 100;
      const y = Math.random() * (canvas.height / 2) + 50;
      createFirework(x, y);
    }, i * 200);
  }
}

// 放烟花按钮事件
const fireworksBtn = document.getElementById("fireworksBtn");
fireworksBtn.addEventListener("click", () => {
  initAudio();
  const count = Math.floor(Math.random() * 2) + 2;
  createRandomFireworks(count);
});

// 点击页面任意位置生成单枚烟花
canvas.addEventListener("click", (e) => {
  initAudio();
  const x = e.clientX;
  const y = e.clientY;
  createFirework(x, y);
});

// 动画循环
function animate() {
  ctx.fillStyle = "rgba(10, 15, 36, 1)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 更新烟花弹（清理已爆炸且噼啪声超时的烟花）
  fireworks = fireworks.filter((firework) => {
    if (!firework.exploded) {
      firework.update();
      firework.draw();
      return true;
    }
    // 爆炸后，等待噼啪声超时再清理烟花实例
    return firework.isSparkleAllowed;
  });

  // 更新粒子
  particles = particles.filter((particle) => {
    particle.update();
    particle.draw();
    return particle.alpha > 0;
  });

  requestAnimationFrame(animate);
}
animate();