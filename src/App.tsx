import { useRef, useEffect, Suspense, Component } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import create from "zustand"
import { subscribeWithSelector } from "zustand/middleware"
import { useControls } from "leva"
import * as THREE from "three"

const rpi = () => Math.random() * Math.PI
type Store = {
	amount: number
	boxes: number[]
	coords: [number, number, number][]
	create: (amount: number) => void
	advance: () => void
}

const useStore = create(
	subscribeWithSelector<Store>((set) => ({
		amount: 0,
		boxes: [],
		coords: [],
		create: (amount) => {
			const ids = new Array(amount).fill(0).map((_, i) => i)
			const coords = new Array(amount)
				.fill([0, 0, 0])
				.map((_, i) => [rpi(), rpi(), rpi()]) as Store["coords"]

			set({
				amount,
				boxes: ids,
				coords: coords,
			})
		},
		advance: () => {
			set((state) => {
				const coords = [] as Store["coords"]
				for (let i = 0; i < state.boxes.length; i++) {
					const id = state.boxes[i]
					const [x, y, z] = state.coords[id]
					coords[id] = [x + 0.01, y + 0.01, z + 0.01]
				}
				return { ...state, coords }
			})
		},
	}))
)

function ItemSlow({ id }: { id: number }) {
	const coords = useStore((state) => state.coords[id])
	if (!coords) return null
	return (
		<mesh rotation={coords}>
			<boxBufferGeometry args={[2, 2, 2]} attach="geometry" />
			<meshNormalMaterial attach="material" />
		</mesh>
	)
}

function ItemFast({ id }: { id: number }) {
	const mesh = useRef<THREE.Mesh>(null!)
	const coords = useRef<[number, number, number]>([0, 0, 0])
	useEffect(() =>
		useStore.subscribe(
			(state) => state.coords[id],
			(xyz) => (coords.current = xyz)
		)
	)
	useFrame(() => mesh.current && mesh.current.rotation.set(...coords.current))
	return (
		<mesh ref={mesh}>
			<boxBufferGeometry args={[2, 2, 2]} attach="geometry" />
			<meshNormalMaterial attach="material" />
		</mesh>
	)
}

function Boxes({ transient }: { transient: boolean }) {
	const boxes = useStore((state) => state.boxes)
	const Component = transient ? ItemFast : ItemSlow

	return (
		<>
			{boxes.map((id) => (
				<Component key={id} id={id} />
			))}
		</>
	)
}

const tO = new THREE.Object3D()

function InstancedBoxes({ size }: { size: number }) {
	const mesh = useRef<THREE.InstancedMesh>(null!)
	const coords = useRef<Store["coords"]>([])

	useEffect(() =>
		useStore.subscribe(
			(state) => state.coords,
			(crds) => (coords.current = crds)
		)
	)

	useFrame(() => {
		for (const [i, item] of coords.current.entries()) {
			tO.position.set(0, 0, 0)
			tO.rotation.set(...item)
			tO.updateMatrix()

			mesh.current.setMatrixAt(i, tO.matrix)
		}

		mesh.current.instanceMatrix.needsUpdate = true
	})

	return (
		<instancedMesh ref={mesh} args={[null!, null!, size]}>
			<boxBufferGeometry args={[2, 2, 2]} attach="geometry" />
			<meshNormalMaterial attach="material" />
		</instancedMesh>
	)
}

function Description({
	amount,
	transient,
	concurrent,
	instanced,
}: {
	amount: number
	transient: boolean
	concurrent: boolean
	instanced: boolean
}) {
	const mode = concurrent ? "Concurrent" : "Legacy"
	const flux = transient ? "Transient" : "Reactive"

	return (
		<div className="description">
			<span>
				{amount} connected components update{" "}
				<b>{transient ? "transiently" : "reactively"}</b> 60 times/second in{" "}
				<b>{concurrent ? "concurrent" : "legacy"} mode</b>{" "}
				{instanced ? (
					<>
						using <b>instancing</b>
					</>
				) : (
					""
				)}
			</span>
			<hr />
			<span>
				<b>{mode} mode</b>{" "}
				{concurrent
					? "means that React renders asynchroneously. It will now batch updates and schedule render passes. If you give it an impossible amount of load, so many render requests that it must choke, it will start to manage these requests to establish a stable 60/fps, by updating components virtually and letting them retain their visual state, using back buffers, etc."
					: "means that React renders synchroneously. This is how frameworks usually fare, despite micro-optimizations and good benchmarks. The renderer will eventually crumble under load, which in the web is easy, given that we only have more or less 20ms per frame on the javascript mainthread before we face jank."}
			</span>
			<p>
				<b>{flux} updates</b>{" "}
				{transient
					? "means that the state manager informs components of changes without re-rendering them. "
					: "means that the state manager informs components of changes by re-rendering them with fresh props. This is how most state managers, like Redux, usually work."}
				{transient ? (
					<span>
						This is a{" "}
						<a href="https://github.com/react-spring/zustand">Zustand</a>{" "}
						feature, a Redux-like flux state manager.
					</span>
				) : (
					""
				)}
			</p>
		</div>
	)
}

function App() {
	const ref = useRef<HTMLDivElement>(null)

	const { amount, root, flux, instanced, dpr } = useControls({
		dpr: {
			value: 1,
			options: [0.5, 0.7, 0.8, 0.9],
		},
		amount: {
			value: 20,
			options: [20, 100, 200, 500, 1000, 2000],
		},
		root: {
			value: "concurrent (fast)",
			options: ["blocking (slow)", "concurrent (fast)"],
		},
		flux: {
			value: "transient (fast)",
			options: ["reactive (slow)", "transient (fast)"],
		},
		instanced: {
			value: true,
		},
	})

	const concurrent = root === "concurrent (fast)"
	const transient = flux === "transient (fast)"

	useEffect(() => {
		let frame: number | undefined = undefined

		useStore.getState().create(amount)

		let lastCalledTime = Date.now()
		let fps = 0

		function renderLoop() {
			let delta = (Date.now() - lastCalledTime) / 1000
			lastCalledTime = Date.now()
			fps = 1 / delta
			ref.current && (ref.current.innerText = "fps " + fps.toFixed())
			// Change state every frame
			useStore.getState().advance()
			frame = requestAnimationFrame(renderLoop)
		}

		renderLoop()

		return () => {
			if (frame != null) cancelAnimationFrame(frame)
		}
	}, [amount, concurrent, transient])

	return (
		<div
			className="main"
			style={{
				background: transient || concurrent ? "#272737" : "indianred",
			}}
		>
			<Canvas
				linear
				mode={concurrent ? "concurrent" : "blocking"}
				key={amount + root + flux}
				dpr={dpr}
			>
				<Suspense fallback={null}>
					<ErrorBoundaries>
						{instanced ? (
							<InstancedBoxes size={amount} />
						) : (
							<Boxes transient={transient} />
						)}
					</ErrorBoundaries>
				</Suspense>
			</Canvas>
			<div ref={ref} className="fps" />
			<Description
				amount={amount}
				concurrent={concurrent}
				transient={transient}
				instanced={instanced}
			/>
		</div>
	)
}

class ErrorBoundaries extends Component {
	state = { hasError: false }
	static getDerivedStateFromError = (error: any) => ({ hasError: true })
	render = () => (this.state.hasError ? null : this.props.children)
}

export default App
