import * as THREE from '../node_modules/three/build/three.module.js';
import * as CANNON from '../node_modules/cannon-es/dist/cannon-es.js';
import { PointerLockControlsCannon } from './PointerLockControlsCannon.js'

let camera, scene, renderer
let floorMat, boxMat, hoopMat, boardMat, ballMat
let scor = 0, sensCos = false

// cannon.js variables
let world
let controls
const timeStep = 1 / 60
let lastCallTime = performance.now()
let sphereShape
let sphereBody
let physicsMaterial
let ballPhysicsMaterial
const balls = []
const ballMeshes = []
const boxes = []
const boxMeshes = []

let triggerBody = new CANNON.Body({ isTrigger: true })
const instructions = document.getElementById('instructions')
const scorHTML = document.getElementById('scor')

let torusBody, torusMesh, boardBody, boardMesh

initThree()
initCannon()
initPointerLock()
animate()

function initThree() {
    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)

    // Scene
    scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x4FAEBF, 0, 500)

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setClearColor(scene.fog.color)

    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    document.body.appendChild(renderer.domElement)

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1)
    scene.add(ambientLight)

    const spotlight = new THREE.SpotLight(0xffffff, 0.9, 0, Math.PI / 4, 1)
    spotlight.position.set(0, 40, 10)
    spotlight.target.position.set(0, 0, 0)

    spotlight.castShadow = true

    spotlight.shadow.camera.near = 10
    spotlight.shadow.camera.far = 100
    spotlight.shadow.camera.fov = 30

    spotlight.shadow.mapSize.width = 2048
    spotlight.shadow.mapSize.height = 2048

    scene.add(spotlight)

    //material = new THREE.MeshLambertMaterial({ color: 0xffffff })
    floorMat = new THREE.MeshStandardMaterial({ color: 0xe6e6fa })
    boxMat = new THREE.MeshStandardMaterial({ color: 0x4b6f89 })
    hoopMat = new THREE.MeshStandardMaterial({ color: 0xd21500 })
    boardMat = new THREE.MeshStandardMaterial({ color: 0xff8200 })
    ballMat = new THREE.MeshStandardMaterial({ color: 0x66ff00 })

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(70, 70, 70, 70)
    floorGeometry.rotateX(-Math.PI / 2)
    const floor = new THREE.Mesh(floorGeometry, floorMat)
    floor.receiveShadow = true
    scene.add(floor)

    window.addEventListener('resize', onWindowResize)
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
}

function initCannon() {
    world = new CANNON.World()

    // Tweak contact properties.
    // Contact stiffness - use to make softer/harder contacts
    world.defaultContactMaterial.contactEquationStiffness = 1e9

    // Stabilization time in number of timesteps
    world.defaultContactMaterial.contactEquationRelaxation = 4

    const solver = new CANNON.GSSolver()
    solver.iterations = 7
    solver.tolerance = 0.1
    world.solver = new CANNON.SplitSolver(solver)

    world.gravity.set(0, -20, 0)

    physicsMaterial = new CANNON.Material('physics')
    ballPhysicsMaterial = new CANNON.Material('physics')
    const physics_physics = new CANNON.ContactMaterial(physicsMaterial, physicsMaterial, {
        friction: 0.9,
        restitution: 0.1,
    })

    const ball_physics = new CANNON.ContactMaterial(physicsMaterial, ballPhysicsMaterial, {
        friction: 0.4,
        restitution: 0.7,
    })

    world.addContactMaterial(physics_physics)
    world.addContactMaterial(ball_physics)

    // Create the user collision sphere
    const radius = 1.3
    sphereShape = new CANNON.Sphere(radius)
    sphereBody = new CANNON.Body({ mass: 5, material: physicsMaterial })
    sphereBody.addShape(sphereShape)
    sphereBody.position.set(0, 5, 0)
    sphereBody.linearDamping = 0.9
    world.addBody(sphereBody)

    // Create the ground plane
    const groundShape = new CANNON.Plane()
    const groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial })
    groundBody.addShape(groundShape)
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    world.addBody(groundBody)

    
    const boardExtents = new CANNON.Vec3(1.8, 1.4, 0.2)
    const boardShape = new CANNON.Box(boardExtents)
    boardBody = new CANNON.Body({ mass: 0 })
    boardBody.addShape(boardShape)
    boardBody.position.set(0, 4.5, -4.85)

    const boardGeometry = new THREE.BoxGeometry(boardExtents.x * 2, boardExtents.y * 2, boardExtents.z * 2)
    boardMesh = new THREE.Mesh(boardGeometry, boardMat)
    boardMesh.position.copy(boardBody.position)
    boardMesh.quaternion.copy(boardBody.quaternion)

    world.addBody(boardBody)
    scene.add(boardMesh)
    

    const torusShape = CANNON.Trimesh.createTorus(0.7, 0.2, 25, 25)
    torusBody = new CANNON.Body({ mass: 0 })
    torusBody.addShape(torusShape)
    torusBody.position.set(0, 3.5, -4)
    torusBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)

    const torusGeometry = new THREE.TorusGeometry(0.6, 0.1, 25, 25)
    torusMesh = new THREE.Mesh(torusGeometry, hoopMat)
    torusMesh.position.copy(torusBody.position)
    torusMesh.quaternion.copy(torusBody.quaternion)

    world.addBody(torusBody)
    scene.add(torusMesh)

    // Add boxes both in cannon.js and three.js
    const halfExtents = new CANNON.Vec3(1, 1, 1)
    const boxShape = new CANNON.Box(halfExtents)
    const boxGeometry = new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2)

    const triggerShape = new CANNON.Box(new CANNON.Vec3(0.3, 0.1, 0.3))
    triggerBody.addShape(triggerShape)
    triggerBody.position.copy(torusBody.position)
    world.addBody(triggerBody)

    triggerBody.addEventListener('collide', (event) => {
        scor = scor + 1;
        scorHTML.innerHTML = scor;
        scorHTML.style.fontSize = "40px";
    })

    for (let i = 0; i < 4; i++) {
        const boxBody = new CANNON.Body({ mass: 5, material: physicsMaterial })
        boxBody.addShape(boxShape)
        const boxMesh = new THREE.Mesh(boxGeometry, boxMat)

        const x = (Math.random() - 0.5) * 20
        const y = (Math.random() - 0.5) * 1 + 1
        const z = (Math.random() - 0.5) * 20

        boxBody.position.set(x, y, z)
        boxMesh.position.copy(boxBody.position)

        boxMesh.castShadow = true
        boxMesh.receiveShadow = true

        world.addBody(boxBody)
        scene.add(boxMesh)
        boxes.push(boxBody)
        boxMeshes.push(boxMesh)
    }  

    // The shooting balls
    const shootVelocity = 13.5
    const ballShape = new CANNON.Sphere(0.2)
    const ballGeometry = new THREE.SphereGeometry(ballShape.radius, 32, 32)

    // Returns a vector pointing the the diretion the camera is at
    function getShootDirection() {
        const vector = new THREE.Vector3(0, 0, 1)
        vector.unproject(camera)
        const ray = new THREE.Ray(sphereBody.position, vector.sub(sphereBody.position).normalize())
        return ray.direction
    }

    window.addEventListener('click', (event) => {
        if (!controls.enabled) {
            return
        }

        const ballBody = new CANNON.Body({ mass: 1 , material: ballPhysicsMaterial})
        ballBody.addShape(ballShape)
        ballBody.angularDamping = 0.5;
        const ballMesh = new THREE.Mesh(ballGeometry, ballMat)

        ballMesh.castShadow = true
        ballMesh.receiveShadow = true

        world.addBody(ballBody)
        scene.add(ballMesh)
        balls.push(ballBody)
        ballMeshes.push(ballMesh)

        const shootDirection = getShootDirection()
        ballBody.velocity.set(
            shootDirection.x * shootVelocity,
            shootDirection.y * shootVelocity,
            shootDirection.z * shootVelocity
        )
        
        // Move the ball outside the player sphere
        const x = sphereBody.position.x + shootDirection.x * (sphereShape.radius * 1.02 + ballShape.radius)
        const y = sphereBody.position.y + shootDirection.y * (sphereShape.radius * 1.02 + ballShape.radius)
        const z = sphereBody.position.z + shootDirection.z * (sphereShape.radius * 1.02 + ballShape.radius)
        ballBody.position.set(x, y, z)
        ballMesh.position.copy(ballBody.position)
    })
}

function initPointerLock() {
    controls = new PointerLockControlsCannon(camera, sphereBody)
    controls.enabled = true;
    scene.add(controls.getObject())
    
    instructions.addEventListener('click', () => {
        controls.lock()
    })

    controls.addEventListener('lock', () => {
        controls.enabled = true
        instructions.style.display = 'none'
        scorHTML.style.display = 'flex'
    })

    controls.addEventListener('unlock', () => {
        controls.enabled = false
        instructions.style.display = null
        scorHTML.style.display = 'none'
    })
}

function animate() {
    requestAnimationFrame(animate)

    const time = performance.now() / 1000
    const dt = time - lastCallTime
    lastCallTime = time
    
    if (controls.enabled) {
        world.step(timeStep, dt)

        // Update ball positions
        for (let i = 0; i < balls.length; i++) {
            ballMeshes[i].position.copy(balls[i].position)
            ballMeshes[i].quaternion.copy(balls[i].quaternion)

            if (Math.abs(balls[i].velocity.x) <= 0.01 && Math.abs(balls[i].velocity.z) <= 0.01)
            {
                world.removeBody(balls[i])
                scene.remove(ballMeshes[i])
            }
        }

        // Update box positions
        for (let i = 0; i < boxes.length; i++) {
            boxMeshes[i].position.copy(boxes[i].position)
            boxMeshes[i].quaternion.copy(boxes[i].quaternion)
        }

        if(scor >= 5)
        {
            if(scor >= 10)
            {
                if(sensCos === true){
                    boardBody.position.z += 0.03
                    torusBody.position.z += 0.03
                    triggerBody.position.z += 0.03
                    if(boardBody.position.z >= 12)
                        sensCos = false
                }
                else{
                    boardBody.position.z -= 0.03
                    torusBody.position.z -= 0.03
                    triggerBody.position.z -= 0.03
                    if(boardBody.position.z <= -12)
                        sensCos = true
                }
            }

            if(sensCos === true){
                boardBody.position.x += 0.03
                torusBody.position.x += 0.03
                triggerBody.position.x += 0.03
                if(boardBody.position.x >= 12)
                    sensCos = false
            }
            else{
                boardBody.position.x -= 0.03
                torusBody.position.x -= 0.03
                triggerBody.position.x -= 0.03
                if(boardBody.position.x <= -12)
                    sensCos = true
            }
            
            boardMesh.position.copy(boardBody.position)
            torusMesh.position.copy(torusBody.position)
        }
    }

    controls.update(dt)
    renderer.render(scene, camera)
}

