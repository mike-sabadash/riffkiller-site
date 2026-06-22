/**
 * Анимация 🔥 в карточке Streak на profile.html: мерцание + искры в локальном canvas.
 * Контейнер: #streakFireIcon (1em×1em); canvas шире/выше с mask — сетка карточки не меняется.
 */
(function () {
    'use strict';

    function initStreakFire() {
        var root = document.getElementById('streakFireIcon');
        if (!root) return;
        var canvas = root.querySelector('.fire-sparks-canvas');
        var fireEmoji = root.querySelector('.fire-emoji');
        if (!canvas || !fireEmoji) return;
        var ctx = canvas.getContext('2d');
        if (!ctx) return;

        var particles = [];
        var MAX_PARTICLES = 52;
        var SPARKS_PER_FRAME = 0.32;
        var COLORS = [
            { r: 255, g: 100, b: 20 },
            { r: 255, g: 140, b: 30 },
            { r: 255, g: 70, b: 10 },
            { r: 255, g: 180, b: 40 },
            { r: 255, g: 90, b: 15 },
            { r: 255, g: 200, b: 50 }
        ];

        var fireRect = { w: 0, h: 0 };
        var centerX = 0;
        var centerY = 0;
        var canvasLogicalW = 1;
        var canvasLogicalH = 1;
        var animationId = null;
        var dpr = 1;

        function resizeCanvas() {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            /* Размер по фактической области рисования (canvas вылезает вверх за пределы 1em root) */
            var w = canvas.clientWidth;
            var h = canvas.clientHeight;
            if (w < 2 || h < 2) return;
            canvasLogicalW = w;
            canvasLogicalH = h;
            canvas.width = Math.max(1, Math.floor(w * dpr));
            canvas.height = Math.max(1, Math.floor(h * dpr));
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            updateFirePosition();
        }

        function updateFirePosition() {
            var canvasRect = canvas.getBoundingClientRect();
            var emojiRect = fireEmoji.getBoundingClientRect();
            fireRect.w = emojiRect.width;
            fireRect.h = emojiRect.height;
            centerX = emojiRect.left + emojiRect.width / 2 - canvasRect.left;
            centerY = emojiRect.top + emojiRect.height / 2 - canvasRect.top;
        }

        function Spark(x, y, vx, vy, size, color, opacity, lifeDecay, bright) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.size = size;
            this.color = color;
            this.opacity = opacity;
            this.lifeDecay = lifeDecay;
            this.bright = !!bright;
            this.active = true;
        }

        Spark.prototype.update = function () {
            this.x += this.vx;
            this.y += this.vy;
            /* Лёгкая «столбовая» тяга вверх: искры дольше летят, как у настоящего огня */
            this.vy += 0.028;
            var decay = this.lifeDecay;
            if (this.vy < -0.18) decay *= 0.42;
            else if (this.vy < 0.08) decay *= 0.72;
            this.opacity -= decay;
            if (this.opacity < 0.02) this.active = false;
            if (
                this.y + this.size < -Math.max(80, canvasLogicalH * 0.95) ||
                this.y - this.size > canvasLogicalH + 80 ||
                this.x + this.size < -40 ||
                this.x - this.size > canvasLogicalW + 40
            ) {
                this.active = false;
            }
        };

        Spark.prototype.draw = function (c) {
            if (!this.active) return;
            var boost = this.bright ? 1.48 : 1.1;
            var alpha = Math.min(this.opacity * boost, 0.99);
            /* Доп. смягчение у верхней зоны (в т.ч. если mask слабее в каком-то движке) */
            var topFade = 1;
            if (canvasLogicalH > 8) {
                var ny = this.y / canvasLogicalH;
                if (ny < 0.22) {
                    topFade = Math.max(0, Math.min(1, ny / 0.22));
                    topFade = topFade * topFade;
                }
            }
            alpha *= topFade;
            if (alpha < 0.02) return;
            var r = this.color.r;
            var g = Math.max(48, this.color.g * (this.opacity + 0.22));
            var b = Math.max(24, this.color.b * (this.opacity * 0.68));
            if (this.bright) {
                g = Math.min(255, g + 42);
                r = Math.min(255, r + 12);
            } else {
                g = Math.min(255, g + 10);
                r = Math.min(255, r + 4);
            }
            c.beginPath();
            c.arc(this.x, this.y, this.size * 0.78, 0, Math.PI * 2);
            var gradient = c.createRadialGradient(this.x, this.y, this.size * 0.2, this.x, this.y, this.size);
            if (this.bright) {
                gradient.addColorStop(0, 'rgba(255, 252, 235, ' + alpha * 0.96 + ')');
                gradient.addColorStop(0.35, 'rgba(255, 210, 105, ' + alpha * 0.9 + ')');
                gradient.addColorStop(0.65, 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha * 0.78 + ')');
            } else {
                gradient.addColorStop(0, 'rgba(255, 185, 85, ' + alpha * 0.88 + ')');
                gradient.addColorStop(0.6, 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha * 0.68 + ')');
            }
            gradient.addColorStop(1, 'rgba(' + Math.floor(r * 0.6) + ', ' + Math.floor(g * 0.3) + ', 15, 0)');
            c.fillStyle = gradient;
            c.fill();
        };

        function createSpark(baseX, baseY) {
            var offsetX = (Math.random() - 0.5) * fireRect.w * 0.5;
            var offsetY = (Math.random() - 0.5) * fireRect.h * 0.32 - 4;
            var spawnX = baseX + offsetX;
            var spawnY = baseY + offsetY - fireRect.h * 0.08;
            var vy = -(2.15 + Math.random() * 3.35);
            var vx = (Math.random() - 0.5) * 1.35;
            var size = 0.55 + Math.random() * 0.95;
            var colorIdx = Math.floor(Math.random() * COLORS.length);
            var baseColor = {
                r: COLORS[colorIdx].r + (Math.random() - 0.5) * 20,
                g: COLORS[colorIdx].g + (Math.random() - 0.5) * 25,
                b: COLORS[colorIdx].b + (Math.random() - 0.5) * 12
            };
            baseColor.r = Math.min(255, Math.max(180, baseColor.r));
            baseColor.g = Math.min(200, Math.max(50, baseColor.g));
            baseColor.b = Math.min(80, Math.max(15, baseColor.b));
            var bright = Math.random() < 0.3;
            var opacity = bright ? 0.66 + Math.random() * 0.2 : 0.54 + Math.random() * 0.22;
            var lifeDecay = 0.0032 + Math.random() * 0.0068;
            return new Spark(spawnX, spawnY, vx, vy, size, baseColor, opacity, lifeDecay, bright);
        }

        function generateSparks(cx, cy) {
            if (!cx && cx !== 0) return;
            if (!cy && cy !== 0) return;
            var targetSparks = SPARKS_PER_FRAME;
            if (particles.length > MAX_PARTICLES * 0.85) targetSparks = 0.12;
            else if (particles.length < MAX_PARTICLES * 0.28) targetSparks = 0.5;
            var sparksToAdd = Math.floor(targetSparks) + (Math.random() < targetSparks - Math.floor(targetSparks) ? 1 : 0);
            sparksToAdd = Math.min(sparksToAdd, 1);
            var i;
            for (i = 0; i < sparksToAdd; i++) {
                if (particles.length < MAX_PARTICLES + 12) {
                    particles.push(createSpark(cx, cy));
                }
            }
        }

        function updateParticles() {
            var i;
            for (i = particles.length - 1; i >= 0; i--) {
                particles[i].update();
                if (!particles[i].active) particles.splice(i, 1);
            }
        }

        function drawParticles() {
            ctx.clearRect(0, 0, canvasLogicalW, canvasLogicalH);
            var i;
            for (i = 0; i < particles.length; i++) {
                particles[i].draw(ctx);
            }
        }

        /** Лёгкое мерцание: только мелкие провалы яркости, без «гаснущего» огня */
        function randomFlicker() {
            var flickerDuration = 28 + Math.random() * 55;
            var targetOpacity = 0.88 + Math.random() * 0.09;
            fireEmoji.style.transition = 'opacity ' + flickerDuration + 'ms ease-out';
            fireEmoji.style.opacity = String(targetOpacity);
            setTimeout(function () {
                if (!fireEmoji.parentNode) return;
                fireEmoji.style.transition = 'opacity 35ms ease-in';
                fireEmoji.style.opacity = '1';
                setTimeout(function () {
                    if (fireEmoji.parentNode) fireEmoji.style.transition = '';
                }, 45);
            }, flickerDuration);
        }

        function scheduleFlicker() {
            var nextDelay = 2200 + Math.random() * 4800;
            setTimeout(function () {
                if (!root.parentNode) return;
                randomFlicker();
                scheduleFlicker();
            }, nextDelay);
        }

        var visible = true;
        if (typeof IntersectionObserver !== 'undefined') {
            var io = new IntersectionObserver(
                function (entries) {
                    entries.forEach(function (e) {
                        visible = e.isIntersecting;
                    });
                },
                { root: null, rootMargin: '32px', threshold: 0 }
            );
            io.observe(root);
        }

        function animate() {
            if (visible && root.clientWidth > 1) {
                updateFirePosition();
                if (!isNaN(centerX) && !isNaN(centerY)) {
                    generateSparks(centerX, centerY);
                }
                updateParticles();
                drawParticles();
            } else {
                particles.length = 0;
                ctx.clearRect(0, 0, canvasLogicalW, canvasLogicalH);
            }
            animationId = requestAnimationFrame(animate);
        }

        resizeCanvas();
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(function () {
                resizeCanvas();
            });
            ro.observe(root);
            ro.observe(canvas);
        }
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('scroll', updateFirePosition, true);

        animate();
        scheduleFlicker();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStreakFire);
    } else {
        initStreakFire();
    }
})();
