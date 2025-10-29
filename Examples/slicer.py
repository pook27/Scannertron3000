import trimesh
import numpy as np
import json

# --- Simulation Settings ---
# Set these to match your theoretical sensor
NUM_LEVELS = 200  # How many "rings" to scan
POINTS_PER_RING = 100  # How many sensor "pings" per 360-degree spin
MODEL_FILE = 'uploads_files_2023543_barrel.stl'  # Change this to '3DBenchy.stl' or your model
# FIX: Output file is now a .json file
OUTPUT_FILE = 'sensor_data.json'
# ---------------------------

# 1. Load your 3D model file
try:
    mesh = trimesh.load_mesh(MODEL_FILE)
except Exception as e:
    print(f"Error loading mesh: {e}")
    print(f"Please make sure '{MODEL_FILE}' is in the same directory.")
    exit()

# 2. Consolidate and Center the Mesh
if isinstance(mesh, trimesh.Scene):
    print("STL contains multiple bodies. Consolidating into a single mesh...")
    mesh = mesh.dump(concatenate=True)
mesh.apply_translation(-mesh.center_mass)
print("Mesh consolidated and centered at (0, 0, 0).")

# 3. Define Z-heights and Angles
z_min = mesh.bounds[0][2]
z_max = mesh.bounds[1][2]
print(f"Slicing from z={z_min:.2f} to z={z_max:.2f}")

z_heights = np.linspace(z_min, z_max, NUM_LEVELS)
angles = np.linspace(0, 2 * np.pi, POINTS_PER_RING, endpoint=False)

print("Using built-in 'mesh.ray' for raycasting.")

# 5. Simulate the Scan
all_levels = []
print(f"Simulating scan with {NUM_LEVELS} levels and {POINTS_PER_RING} points per level...")

for z in z_heights:
    ray_origins = np.zeros((POINTS_PER_RING, 3))
    ray_origins[:, 2] = z

    ray_directions = np.zeros((POINTS_PER_RING, 3))
    ray_directions[:, 0] = np.cos(angles)
    ray_directions[:, 1] = np.sin(angles)

    # Use the built-in 'mesh.ray' intersector
    hit_locations, index_ray, _ = mesh.ray.intersects_location(
        ray_origins, ray_directions
    )

    hits_map = {idx: loc for idx, loc in zip(index_ray, hit_locations)}

    level_points = []
    for j in range(POINTS_PER_RING):
        if j in hits_map:
            # Ray HIT: Add a {x, y, z} dictionary
            p = hits_map[j]
            level_points.append({'x': float(p[0]), 'y': float(p[1]), 'z': float(p[2])})
        else:
            # Ray MISSED: Add a dictionary for the center point
            level_points.append({'x': 0.0, 'y': 0.0, 'z': float(z)})

    all_levels.append(level_points)  # Add the list of dictionaries

# 6. Save the final data
# Use json.dump to write the data as a clean JSON file
with open(OUTPUT_FILE, "w") as f:
    json.dump(all_levels, f, indent=2)  # indent=2 is optional, but nice for readability

print(f"\nSuccessfully generated '{OUTPUT_FILE}'!")
print(f"Total levels generated: {len(all_levels)}")

