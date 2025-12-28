import trimesh
import numpy as np
import json

# --- Simulation Settings ---
NUM_LEVELS = 200  # Vertical resolution
POINTS_PER_RING = 360  # Angular resolution (1 degree steps)
MODEL_FILE = '3DBenchy.stl'
OUTPUT_FILE = 'sensor_data.json'

# 1. Load & Center Mesh
try:
    mesh = trimesh.load_mesh(MODEL_FILE)
except Exception as e:
    print(f"Error: {e}")
    exit()

if isinstance(mesh, trimesh.Scene):
    mesh = mesh.dump(concatenate=True)

# Center the mesh at 0,0,0
mesh.apply_translation(-mesh.center_mass)

# 2. Calculate Bounds & Sensor Position
z_min = mesh.bounds[0][2]
z_max = mesh.bounds[1][2]

# Important: Determine how far out the "sensor" should be.
# We take the max width of the object and multiply by 1.5 to be safe.
max_width = max(abs(mesh.bounds[0][0]), abs(mesh.bounds[1][0]), abs(mesh.bounds[0][1]), abs(mesh.bounds[1][1]))
SENSOR_RADIUS = max_width * 2.0

print(f"Object bounds: Z={z_min:.2f} to {z_max:.2f}")
print(f"Simulating Sensor at Radius: {SENSOR_RADIUS:.2f}")

z_heights = np.linspace(z_min + 1, z_max - 1, NUM_LEVELS)
angles = np.linspace(0, 2 * np.pi, POINTS_PER_RING, endpoint=False)

all_levels = []

print(f"Scanning {NUM_LEVELS} layers...")

for i, z in enumerate(z_heights):
    # 1. ORIGIN: Create a ring of points OUTSIDE the object
    ray_origins = np.zeros((POINTS_PER_RING, 3))
    ray_origins[:, 0] = SENSOR_RADIUS * np.cos(angles)
    ray_origins[:, 1] = SENSOR_RADIUS * np.sin(angles)
    ray_origins[:, 2] = z

    # 2. DIRECTION: Point INWARDS towards (0,0,z)
    # The direction vector is just the inverse of the origin vector (normalized)
    ray_directions = -ray_origins.copy()
    ray_directions[:, 2] = 0  # Ensure we shoot perfectly horizontal
    # Normalize vectors
    norms = np.linalg.norm(ray_directions, axis=1)
    ray_directions = ray_directions / norms[:, np.newaxis]

    # 3. SHOOT RAYS
    # hit_locations = XYZ of where the ray hit
    # index_ray = which ray number (0..359) hit something
    hit_locations, index_ray, _ = mesh.ray.intersects_location(
        ray_origins, ray_directions
    )

    # 4. FILTER: Find the CLOSEST hit to the SENSOR (not the center)
    # We want the first surface the laser touches.

    closest_hits = {}  # Map: ray_index -> (distance_from_sensor, xyz_location)

    for hit_idx, ray_idx in enumerate(index_ray):
        loc = hit_locations[hit_idx]
        origin = ray_origins[ray_idx]

        # Calculate distance from SENSOR to HIT
        dist_sq = (loc[0] - origin[0]) ** 2 + (loc[1] - origin[1]) ** 2

        if ray_idx not in closest_hits:
            closest_hits[ray_idx] = (dist_sq, loc)
        else:
            # If this hit is closer to the sensor than the previous one, take it
            if dist_sq < closest_hits[ray_idx][0]:
                closest_hits[ray_idx] = (dist_sq, loc)

    # 5. FORMATTING
    level_points = []
    for j in range(POINTS_PER_RING):
        if j in closest_hits:
            loc = closest_hits[j][1]
            level_points.append({'x': float(loc[0]), 'y': float(loc[1]), 'z': float(loc[2])})
        else:
            # MISS: Return 0,0,z so the Javascript knows it's empty space
            level_points.append({'x': 0.0, 'y': 0.0, 'z': float(z)})

    all_levels.append(level_points)

    if i%5 == 0:print(f"Processed Layer {i}. {100*i/NUM_LEVELS}% Done.")

# 3. Save
with open(OUTPUT_FILE, "w") as f:
    json.dump(all_levels, f)

print(f"Done! {OUTPUT_FILE} generated.")