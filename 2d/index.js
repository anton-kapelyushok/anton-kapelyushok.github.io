const canvas = document.querySelector("canvas")


let h = 0
let w = 0
let scale = 1

if (window.innerHeight > 680 && window.innerWidth > 980) {
    h = 768
    w = 1366
    scale = 1
} else {
    if (window.innerWidth > window.innerHeight * 16 / 9) {
        h = window.innerHeight - 20
        w = h * 16 / 9
        scale = h / 600
    } else {
        w = window.innerWidth - 20
        h = w / 16 * 9
        scale = h / 600
    }
}
const maxTargetRadius = 100

canvas.width = w
canvas.height = h

const tps = 144
const ctx = canvas.getContext('2d')


class Game {
    constructor() {
        this.objects = []
        this.totalTargets = 0

        this.addTarget()
        this.addTarget()

        this.currentTick = 0

        this.t = 0
        this.speed = 2 // targets per second
        this.acceleration = 0.01 // targets per second per second

        this.misses = 0
        this.hits = 0
        this.lost = 0

        this.mousePath = new MousePath()
        this.objects.push(this.mousePath)

        this.stats = new Stats(this)
        this.objects.push(this.stats)
    }

    tick() {
        this.currentTick += 1
        this.t += this.speed / tps
        this.speed += this.acceleration / tps

        const nextObjects = []
        for (let object of this.objects) {
            const isAlive = object.tick(this.currentTick)
            if (!isAlive) {
                if (object.type === 'Target') {
                    this.lost += 1
                }
            } else {
                nextObjects.push(object)
            }
        }

        this.objects = nextObjects

        while (this.objects.size < 2) {
            this.addTarget()
        }

        if (this.totalTargets < this.t) {
            this.addTarget()
        }
    }

    addTarget() {
        const x = Math.random() * (w - 2 * maxTargetRadius * scale) + maxTargetRadius * scale
        const y = Math.random() * (h - 2 * maxTargetRadius * scale) + maxTargetRadius * scale
        this.objects.push(new Target(x, y, this.totalTargets + 1))
        this.totalTargets += 1
    }

    draw() {
        ctx.fillStyle = 'black'
        ctx.fillRect(0, 0, w, h)

        this.objects.sort((l, r) => l.z - r.z)
        this.objects.forEach(t => t.draw())
    }

    hit(x, y) {
        let minZ = -1
        let minTarget = undefined
        for (let target of this.objects) {
            if (target.isHit(x, y)) {
                if (minZ === -1 || target.z < minZ) {
                    minZ = target.z
                    minTarget = target
                }
            }
        }

        if (minZ !== -1) {
            this.hits += 1
            const trace = new TargetTrace(minTarget.x, minTarget.y, minTarget.z, minTarget.size)
            this.objects = this.objects.map(it => it === minTarget ? trace : it)
            this.objects.push(new HitMarker(x, y, true))
        } else {
            this.misses += 1
            this.objects.push(new HitMarker(x, y, false))
        }
    }

    mouseMove(x, y) {
        this.mousePath.mouseMove(x, y)
    }

    mouseLeave(x, y) {
        this.mousePath.mouseLeave()
    }
}

class Stats {
    constructor(game) {
        this.z = -4
        this.game = game
    }

    tick() {
        return true
    }

    draw() {
        const prettyFloat = f => Math.round(f * 100) / 100

        const fontSize = Math.max(24 * scale, 12)
        ctx.font = `${fontSize}px serif`
        ctx.fillStyle = 'rgb(200, 230, 200)'

        let textY = fontSize
        ctx.fillText(`targets speed ${prettyFloat(this.game.speed)} t/s`, 10, textY)

        textY += fontSize * 1.05
        const speed = this.game.hits / (this.game.currentTick / tps)
        ctx.fillText(`hits ${this.game.hits}, misses ${this.game.misses}, speed = ${prettyFloat(speed)}`, 10, textY)

        textY += fontSize * 1.05
        const accuracy = this.game.hits + this.game.misses === 0 ? 100 : Math.round(this.game.hits * 100 / (this.game.hits + this.game.misses))
        ctx.fillText(`accuracy ${accuracy}%`, 10, textY)

        textY += fontSize * 1.05
        ctx.fillText(`lost ${this.game.lost} targets`, 10, textY)
    }

    isHit() {
        return false
    }
}

class MousePath {
    constructor() {
        this.z = -5
        this.ttl = 5 * tps // seconds
        this.mouseTrace = []
        this.currentTick = 0
    }

    tick(currentTick) {
        this.currentTick = currentTick
        this.mouseTrace = this.mouseTrace.filter(([x, y, t]) => {
            return t + this.ttl >= this.currentTick
        })
        return true
    }

    draw() {
        // console.log(this.mouseTrace.length)
        if (this.mouseTrace.length >= 2) {
            ctx.lineWidth = 2

            let opacity = 255 - Math.round((this.currentTick - this.mouseTrace[0][2]) / this.ttl * 255)

            ctx.beginPath()
            ctx.moveTo(this.mouseTrace[0][0], this.mouseTrace[0][1])
            ctx.strokeStyle = `rgba(50, 50, 50, ${opacity / 255})`
            for (let i = 1; i < this.mouseTrace.length; i++) {

                if (this.mouseTrace[i - 1][0] === -1) {
                    ctx.stroke()
                    ctx.beginPath()
                    continue
                }

                if (this.mouseTrace[i][0] === -1) {
                    continue
                }

                const newOpacity = 255 - Math.round((this.currentTick - this.mouseTrace[i][2]) / this.ttl * 255)
                if (opacity !== newOpacity) {
                    ctx.stroke()
                    ctx.beginPath()
                    ctx.moveTo(this.mouseTrace[i - 1][0], this.mouseTrace[i - 1][1])
                    ctx.strokeStyle = `rgba(50, 50, 50, ${opacity / 255})`
                    // console.log(`rgba(50, 50, 50, ${opacity / 255})`)
                    opacity = newOpacity
                }
                ctx.lineTo(this.mouseTrace[i][0], this.mouseTrace[i][1])
            }
            ctx.stroke()
        }
    }

    mouseMove(x, y) {
        if (this.mouseTrace.length === 0 || this.mouseTrace[this.mouseTrace.length - 1][0] === -1) {
            console.log('add')
            this.addClosestDestination(x, y)
        }

        this.mouseTrace.push([x, y, this.currentTick])
    }

    isHit() {
        return false
    }

    mouseLeave() {
        if (this.mouseTrace.length > 1) {
            const lastTrace = this.mouseTrace[this.mouseTrace.length - 1]
            this.addClosestDestination(lastTrace[0], lastTrace[1]);
        }
        this.mouseTrace.push([-1, -1, this.currentTick])
    }

    addClosestDestination(x, y) {
        const toLeft = x
        const toRight = w - x
        const toTop = y
        const toBottom = h - y

        const min = [toLeft, toRight, toTop, toBottom].reduce((acc, v) => Math.min(acc, v))
        if (toLeft === min) {
            this.mouseTrace.push([0, y, this.currentTick])
        } else if (toRight === min) {
            this.mouseTrace.push([w, y, this.currentTick])
        } else if (toTop === min) {
            this.mouseTrace.push([x, 0, this.currentTick])
        } else {
            this.mouseTrace.push([x, h, this.currentTick])
        }
    }
}


class HitMarker {
    constructor(x, y, success, ttl = 0.6) {
        this.type = 'HitMarker'
        this.x = x
        this.y = y
        this.z = -1
        this.success = success
        this.size = 4
        this.ttl = ttl * tps
        this.ttlMax = this.ttl
    }

    tick() {
        this.ttl -= 1
        return this.ttl >= 0;
    }

    draw() {
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI, false)
        const opacity = this.ttl / this.ttlMax

        if (this.success) {
            ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`
        } else {
            ctx.fillStyle = `rgba(125, 125, 125, ${opacity})`
        }
        ctx.fill()
    }

    isHit(x, y) {
        return false
    }
}


class TargetTrace {
    constructor(x, y, z, size, ttl = 0.6) {
        this.type = 'TargetTrace'
        this.x = x
        this.y = y
        this.z = z
        this.size = size
        this.ttl = ttl * tps
        this.ttlMax = this.ttl
    }

    draw() {
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, 2 * Math.PI, false)
        ctx.strokeStyle = `rgba(255, 255, 255, ${this.ttl / this.ttlMax})`
        ctx.lineWidth = 2
        ctx.stroke()
        // ctx.fill()
    }

    tick() {
        this.ttl -= 1
        return this.ttl >= 0;
    }

    isHit(x, y) {
        return false
    }
}

class Target {
    constructor(x, y, z, size = 1, maxSize = 30, speed = 0.1) {
        this.type = 'target'
        this.x = x
        this.y = y
        this.z = z
        this.size = size
        this.maxSize = maxSize * scale
        this.speed = 15 / tps * scale // pixels per second
        this.growing = true
    }

    tick() /*: boolean */ {
        if (this.growing) {
            this.size += this.speed
        } else {
            this.size -= this.speed
        }
        if (this.size < 0) return false
        if (this.size > this.maxSize) {
            this.size = this.maxSize - (this.size - this.maxSize)
            this.growing = false
        }
        return true
    }

    draw() {
        const stripes = 5
        const stripeSize = this.size / stripes
        let color = 'rgb(220, 0, 0)'
        for (let i = 0; i < stripes; i++) {
            ctx.beginPath()
            ctx.fillStyle = color
            ctx.arc(this.x, this.y, this.size - stripeSize * i, 0, 2 * Math.PI, false)
            ctx.fill()


            if (color === 'rgb(220, 0, 0)') {
                color = 'rgb(220, 220, 220)'
            } else {
                color = 'rgb(220, 0, 0)'
            }
        }
    }

    isHit(x, y) {
        return sqr(this.x - x) + sqr(this.y - y) <= sqr(this.size)
    }
}


function sqr(x) {
    return x * x
}


const game = new Game()

let lastTime = 0

function onAnimationFrame(time) {
    if (lastTime === 0) {
        lastTime = time
    }

    let ticksProcessed = 0
    for (let diff = time - lastTime; diff > 1 / tps; lastTime += 1000 / tps, diff = time - lastTime) {
        game.tick()
        ticksProcessed++
    }

    if (ticksProcessed !== 0) {
        game.draw()
    }

    requestAnimationFrame(onAnimationFrame)
}

canvas.addEventListener('mousedown', (e) => {
    game.hit(e.offsetX, e.offsetY)
})


canvas.addEventListener('mousemove', (e) => {
    game.mouseMove(e.offsetX, e.offsetY)
})

canvas.addEventListener('mouseleave', (e) => {
    game.mouseLeave(e.offsetX, e.offsetY)
})

requestAnimationFrame(onAnimationFrame)
window.game = game
window.h = h
window.w = w