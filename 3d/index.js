function require(module) {
    if (module === './three') {
        return THREE
    }

    if (module === './stats') {
        return window.Stats
    }

    throw Error('Unknown module ' + module)
}

const {
    BoxGeometry,
    WebGLRenderer,
    Scene,
    PerspectiveCamera,
    Mesh,
    AmbientLight,
    MeshLambertMaterial,
    PointerLockControls,
    Raycaster,
    Vector3, PlaneGeometry, PointLight, DirectionalLight, SphereGeometry, MeshBasicMaterial, VSMShadowMap
} = require("./three");

const Stats = require("./stats")
// noinspection JSValidateTypes
const stats = Stats()
document.body.appendChild(stats.dom)

window.canvas = document.querySelector("canvas")
window.scale = 1

canvas.width = window.innerWidth
canvas.height = window.innerHeight
const tps = 144
const boxSize = 100
const cubeSize = 10

const scene = new Scene()
const camera = new PerspectiveCamera(100, window.innerWidth / window.innerHeight, 0.1, 1000)
camera.position.z = boxSize / 2 * 0.95
const renderer = new WebGLRenderer({canvas, antialias: true})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMapEnabled = true


function createBox() {

    const color = 0xeeeeee
    const plane = (color) => {
        const mesh = new Mesh(
            new PlaneGeometry(boxSize, boxSize, 64, 64),
            new MeshLambertMaterial({color})
        );
        mesh.receiveShadow = true
        return mesh;
    }

    const floor = plane(color)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -boxSize / 2
    scene.add(floor)

    const leftWall = plane(color)
    leftWall.rotation.y = Math.PI / 2
    leftWall.position.x = -boxSize / 2
    scene.add(leftWall)

    const rightWall = plane(color)
    rightWall.rotation.y = -Math.PI / 2
    rightWall.position.x = boxSize / 2
    scene.add(rightWall)

    const ceiling = plane(color)
    ceiling.rotation.x = Math.PI / 2
    ceiling.position.y = boxSize / 2
    scene.add(ceiling)

    const forwardWall = plane(color)
    forwardWall.position.z = -boxSize / 2
    scene.add(forwardWall)

    const backWall = plane(color)
    backWall.position.z = boxSize / 2
    backWall.rotation.y = Math.PI
    scene.add(backWall)
}

createBox()


const cubes = []
for (let i = 0; i < 3; i++) {

    // const color = Math.floor(Math.random() * (0xffffff + 1))
    const color = 0xee11111
    const geometry = new BoxGeometry(cubeSize, cubeSize, cubeSize, 8, 8, 8)

    const material = new MeshLambertMaterial({color})
    const cube = new Mesh(geometry, material)
    cube.castShadow = true
    cube.receiveShadow = true

    const angle = Math.random() * 2 * Math.PI
    positionCube({mesh: cube})
    cube.position.z = -boxSize / 2 + cubeSize / 2

    scene.add(cube)
    cubes.push({
        mesh: cube,
        color,
        vrx: Math.random() * 0.02,
        vry: Math.random() * 0.02,
        vrz: Math.random() * 0.02,
        isAimedAt: false,
    })
}


const ambientLight = new AmbientLight(0xffffff, 0.6)
scene.add(ambientLight)
//
const light2 = new PointLight(0xffffff, 0.4, 500, 2);
light2.position.set(0, 40, 40);
light2.castShadow = true
light2.shadowMapHeight = 4096;
light2.shadowMapWidth = 4096;
light2.shadow.radius = 8
// light2.shadowMap.dispose();
// light2.shadowMap = null;
scene.add(light2)

const l2Mesh = new Mesh(new SphereGeometry(), new MeshBasicMaterial({color: 0xFFFFFF}))
l2Mesh.position.x = light2.position.x
l2Mesh.position.y = light2.position.y
l2Mesh.position.z = light2.position.z
scene.add(l2Mesh)

//
// //
// const light2 = new THREE.HemisphereLight(0xfffffff, 0x080808, 1);
// scene.add(light2);

// const light3 = new DirectionalLight( 0xffffff, 0.7);
// light3.position.set( 1, 1, 1.5 );
// light3.castShadow = true; // default false
// scene.add( light3 );


canvas.addEventListener('mousedown', () => shoot())


let lastTime = 0


window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight)
})

const raycaster = new Raycaster()


const controls = new PointerLockControls(camera, canvas, 1.5)


const maxTime = 60

let hits = 0
let misses = 0
let startTick = 0
let currentTick = 0
let lastPlayedTick = 0
let isPlaying = false
let highScore = 0

const hud = document.querySelector('.hud')
const startHud = document.querySelector('.start-hud')
const startButton = document.querySelector('.start-button')
startButton.addEventListener('click', start)
const crosshair = document.querySelector('.crosshair')
const ingameHud = document.querySelector('.ingame-hud')
const hitsIndicator = document.querySelector('.hits')
const missesIndicator = document.querySelector('.misses')
const timeLeftIndicator = document.querySelector('.time-left')
const scoreIndicator = document.querySelector('.score')
const accuracyIndicator = document.querySelector('.accuracy')
const highScoreIndicator = document.querySelector('.high-score')

function start() {
    highScore = +localStorage.getItem('record') ?? '0'
    startHud.style.display = 'none'
    startButton.innerText = 'RESTART'
    restart()
}

function restart() {
    hud.style.pointerEvents = 'none'
    hits = 0
    misses = 0
    isPlaying = false
    crosshair.style.display = 'block'
    ingameHud.style.display = 'flex'
    controls.lock()
}

function gameOver() {
    isPlaying = false
    controls.unlock()
    hud.style.pointerEvents = 'all'
    crosshair.style.display = 'none'
    startHud.style.display = 'flex'

    const score = getScore()
    if (score > highScore) {
        localStorage.setItem('record', score)
        highScore = score
    }
}

function tick() {
    currentTick++

    if (isPlaying) {
        lastPlayedTick = currentTick
        if ((currentTick - startTick) / tps > maxTime) {
            gameOver()
        }
    }
}

function getAccuracy() {
    if (hits + misses === 0) return 1
    return hits / (hits + misses)
}

function getScore() {
    return hits * getAccuracy()
}

function render(time) {
    requestAnimationFrame(render)

    hitsIndicator.innerText = `Hits: ${hits}`
    missesIndicator.innerText = `Misses: ${misses}`
    accuracyIndicator.innerText = `Accuracy: ${Math.round(getAccuracy() * 100)}`
    scoreIndicator.innerText = `Score ${Math.round(getScore())}`
    highScore.innerText = `High score ${Math.round(highScore)}`


    const timeLeft = Math.max(Math.round(maxTime - (lastPlayedTick - startTick) / tps), 0)
    timeLeftIndicator.innerText = `Time left: ${timeLeft}s`

    if (lastTime === 0) {
        lastTime = time
    }

    for (let diff = time - lastTime; diff > 1 / tps; lastTime += 1000 / tps, diff = time - lastTime) {
        tick()
    }

    renderer.render(scene, camera)
    stats.update()
}

render(0)

controls.addEventListener('unlock', gameOver)

function shoot() {
    if (!isPlaying) {
        isPlaying = true
        startTick = currentTick
    }

    raycaster.set(camera.getWorldPosition(new Vector3()), camera.getWorldDirection(new Vector3()))
    let isHit = false
    for (let cube of cubes) {
        const {mesh} = cube
        const intersects = raycaster.intersectObject(mesh).length > 0

        if (intersects) {
            positionCube(cube)
            hits++
            isHit = true
            return
        }
    }
    if (!isHit) {
        misses++
    }
}

function positionCube(cube) {
    if (!cubes.length) {
        return
    }
    let newPositionIntersects = true
    const {mesh} = cube
    do {
        mesh.position.x = (Math.random() * 2 - 1) * (boxSize - cubeSize) / 2
        mesh.position.y = (Math.random() * 2 - 1) * (boxSize - cubeSize) / 2

        for (let cube2 of cubes) {
            if (cube2 === cube) {
                continue
            }
            newPositionIntersects = false
            if (Math.abs(cube2.mesh.position.x - mesh.position.x) < cubeSize && Math.abs(cube2.mesh.position.y - mesh.position.y) < cubeSize) {
                newPositionIntersects = true
                break
            }
        }
    } while (newPositionIntersects)
}