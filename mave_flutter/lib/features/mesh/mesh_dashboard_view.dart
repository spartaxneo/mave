import 'package:flutter/material.dart';
import '../../core/theme/mave_theme.dart';
import '../../core/tactile/tactile_feedback.dart';

class MeshDevice {
  final String id;
  final String name;
  final String role; // 'primary_host' | 'contributor' | 'client'
  final String os;
  final int cpuCores;
  final int ramGb;
  final int vramGb;
  final int batteryPct;
  final bool isCharging;
  final int temperatureC;
  final String status; // 'online' | 'busy' | 'offline'

  const MeshDevice({
    required this.id,
    required this.name,
    required this.role,
    required this.os,
    required this.cpuCores,
    required this.ramGb,
    required this.vramGb,
    required this.batteryPct,
    required this.isCharging,
    required this.temperatureC,
    required this.status,
  });
}

class MeshDagTask {
  final String id;
  final String title;
  final String assignedDevice;
  final double progress;
  final String status; // 'running' | 'completed' | 'queued'

  const MeshDagTask({
    required this.id,
    required this.title,
    required this.assignedDevice,
    required this.progress,
    required this.status,
  });
}

/// MAVE Brain Mesh Mission Control Dashboard
/// Recreates MAVE V2.5 Distributed Compute Architecture & 5 Hallmark Cluster Telemetry Tiles.
class MeshDashboardView extends StatefulWidget {
  final ValueChanged<String>? onCommandExecuted;

  const MeshDashboardView({super.key, this.onCommandExecuted});

  @override
  State<MeshDashboardView> createState() => _MeshDashboardViewState();
}

class _MeshDashboardViewState extends State<MeshDashboardView> {
  bool _isPrimaryHost = true;
  String _activeFilter = 'all';

  // Real cluster state conforming to MAVE Distributed Compute Specification
  final List<MeshDevice> _devices = const [
    MeshDevice(
      id: 'host-workstation-01',
      name: 'Primary Workstation (Desktop)',
      role: 'primary_host',
      os: 'Windows 11 / Linux Host',
      cpuCores: 16,
      ramGb: 64,
      vramGb: 24,
      batteryPct: 100,
      isCharging: true,
      temperatureC: 48,
      status: 'online',
    ),
    MeshDevice(
      id: 'satellite-macbook-pro',
      name: 'MacBook Pro Satellite',
      role: 'contributor',
      os: 'macOS Sonoma (M3 Max)',
      cpuCores: 14,
      ramGb: 36,
      vramGb: 16,
      batteryPct: 86,
      isCharging: false,
      temperatureC: 42,
      status: 'online',
    ),
    MeshDevice(
      id: 'quest-horizon-node',
      name: 'Meta Quest / Spatial Node',
      role: 'client',
      os: 'Meta Horizon OS (XR2 Gen2)',
      cpuCores: 8,
      ramGb: 8,
      vramGb: 4,
      batteryPct: 92,
      isCharging: true,
      temperatureC: 38,
      status: 'online',
    ),
  ];

  final List<MeshDagTask> _activeJobs = const [
    MeshDagTask(
      id: 'dag-subtask-frontend',
      title: 'Monorepo Flutter UI Shard Compilation',
      assignedDevice: 'MacBook Pro Satellite',
      progress: 0.85,
      status: 'running',
    ),
    MeshDagTask(
      id: 'dag-subtask-inference',
      title: 'Qwen3-VL 8B Vulkan Token Generation',
      assignedDevice: 'Primary Workstation (Desktop)',
      progress: 0.62,
      status: 'running',
    ),
    MeshDagTask(
      id: 'dag-subtask-ast',
      title: 'Syntax & Type Checking Cohort',
      assignedDevice: 'Meta Quest / Spatial Node',
      progress: 1.0,
      status: 'completed',
    ),
  ];

  final List<Map<String, String>> _quickChips = const [
    {'label': 'Use desktop for this task', 'cmd': 'route all active workloads to primary desktop workstation'},
    {'label': 'Save laptop battery', 'cmd': 'pause laptop compute sharing and reassign workloads to desktop'},
    {'label': 'Stop sharing GPU', 'cmd': 'disable GPU compute sharing and limit mesh to CPU only'},
    {'label': 'Show active devices', 'cmd': 'list active worker devices and workload distribution'},
    {'label': 'Distribute coding task', 'cmd': 'distribute monorepo compilation and testing across all paired devices'},
  ];

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final isCompact = screenWidth < 768;

    // Calculate cluster sums (preserving discrete honest capacity, LR-141)
    final totalCores = _devices.fold<int>(0, (sum, d) => sum + d.cpuCores);
    final totalRam = _devices.fold<int>(0, (sum, d) => sum + d.ramGb);
    final totalVram = _devices.fold<int>(0, (sum, d) => sum + d.vramGb);

    return Scaffold(
      backgroundColor: MaveTheme.bg,
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Top Primary Host Header Card
            _buildHostStatusCard(),

            const SizedBox(height: 16),

            // 5 Hallmark Cluster Telemetry Tiles
            if (isCompact)
              FromNearHorizontalRail(
                children: [
                  _buildMetricTile(
                    title: 'CONNECTED DEVICES',
                    value: '${_devices.length}',
                    subtitle: '1 Host · 2 Satellites',
                    icon: Icons.devices_outlined,
                    color: MaveTheme.accent,
                  ),
                  _buildMetricTile(
                    title: 'CLUSTER CPU CORES',
                    value: '$totalCores',
                    subtitle: 'Discrete Node Threads',
                    icon: Icons.memory,
                    color: MaveTheme.info,
                  ),
                  _buildMetricTile(
                    title: 'SHARED MESH RAM',
                    value: '${totalRam}GB',
                    subtitle: 'Discrete Allotments',
                    icon: Icons.storage_outlined,
                    color: MaveTheme.warning,
                  ),
                  _buildMetricTile(
                    title: 'VRAM POOL',
                    value: '${totalVram}GB',
                    subtitle: 'Accelerated Model Slots',
                    icon: Icons.electric_bolt,
                    color: MaveTheme.success,
                  ),
                  _buildMetricTile(
                    title: 'ACTIVE DAG JOBS',
                    value: '${_activeJobs.length}',
                    subtitle: 'Subtask Worktrees',
                    icon: Icons.account_tree_outlined,
                    color: MaveTheme.accent,
                  ),
                ],
              )
            else
              Row(
                children: [
                  Expanded(
                    child: _buildMetricTile(
                      title: 'CONNECTED DEVICES',
                      value: '${_devices.length}',
                      subtitle: '1 Host · 2 Satellites',
                      icon: Icons.devices_outlined,
                      color: MaveTheme.accent,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildMetricTile(
                      title: 'CLUSTER CORES',
                      value: '$totalCores',
                      subtitle: 'Compute Threads',
                      icon: Icons.memory,
                      color: MaveTheme.info,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildMetricTile(
                      title: 'SHARED RAM',
                      value: '${totalRam}GB',
                      subtitle: 'Discrete Sum',
                      icon: Icons.storage_outlined,
                      color: MaveTheme.warning,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildMetricTile(
                      title: 'VRAM POOL',
                      value: '${totalVram}GB',
                      subtitle: 'AI Inference Pools',
                      icon: Icons.electric_bolt,
                      color: MaveTheme.success,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildMetricTile(
                      title: 'ACTIVE DAG JOBS',
                      value: '${_activeJobs.length}',
                      subtitle: 'Worktree Pipelines',
                      icon: Icons.account_tree_outlined,
                      color: MaveTheme.accent,
                    ),
                  ),
                ],
              ),

            const SizedBox(height: 20),

            // Natural Language Voice & Directive Quick Chips
            const Text(
              'CLUSTER DIRECTIVES & VOICE QUICK CHIPS',
              style: TextStyle(
                color: MaveTheme.text3,
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              physics: const BouncingScrollPhysics(),
              child: Row(
                children: _quickChips.map((chip) {
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: TactileButton(
                      onTap: () => widget.onCommandExecuted?.call(chip['cmd'] ?? ''),
                      color: MaveTheme.surface2,
                      border: Border.all(color: MaveTheme.borderSubtle),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.bolt, size: 14, color: MaveTheme.accent),
                          const SizedBox(width: 6),
                          Text(
                            chip['label'] ?? '',
                            style: const TextStyle(
                              color: MaveTheme.text1,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),

            const SizedBox(height: 24),

            // Paired Devices Grid Header & Filters
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'PAIRED CLUSTER NODES',
                  style: TextStyle(
                    color: MaveTheme.text3,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.6,
                  ),
                ),
                Row(
                  children: [
                    _buildFilterPill('all', 'All Nodes'),
                    const SizedBox(width: 6),
                    _buildFilterPill('compute', 'Compute Only'),
                    const SizedBox(width: 6),
                    _buildFilterPill('mobile', 'Mobile/Quest'),
                  ],
                ),
              ],
            ),

            const SizedBox(height: 10),

            // Device List Cards
            ..._devices.map(_buildDeviceCard),

            const SizedBox(height: 24),

            // Active DAG Workload Tasks
            const Text(
              'ACTIVE DAG TASK PROGRESSION & SHARDS',
              style: TextStyle(
                color: MaveTheme.text3,
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 10),
            ..._activeJobs.map(_buildTaskCard),
          ],
        ),
      ),
    );
  }

  Widget _buildHostStatusCard() {
    return MaveSurfaceCard(
      backgroundColor: MaveTheme.surface1,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Row(
              children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: MaveTheme.accentSubtle,
                  borderRadius: BorderRadius.circular(MaveTheme.rMd),
                  border: Border.all(color: MaveTheme.accent.withValues(alpha: 0.3)),
                ),
                child: const Center(
                  child: Icon(Icons.hub, color: MaveTheme.accent, size: 22),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                  Row(
                    children: [
                      const Flexible(
                        child: Text(
                          'BRAIN MESH CLUSTER',
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: MaveTheme.text1,
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: MaveTheme.success.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(MaveTheme.rSm),
                          border: Border.all(color: MaveTheme.success.withValues(alpha: 0.4)),
                        ),
                        child: const Text(
                          'P2P ZERO-TRUST LAN',
                          style: TextStyle(
                            color: MaveTheme.success,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Ed25519 Cryptographic Nonces · Replay-Protected · Idempotency Ledger Active',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: MaveTheme.text3, fontSize: 11),
                  ),
                ],
              ),
              ),
            ],
          ),
          ),
          Row(
            children: [
              const Text(
                'Primary Host',
                style: TextStyle(color: MaveTheme.text2, fontSize: 12),
              ),
              const SizedBox(width: 8),
              Switch(
                value: _isPrimaryHost,
                activeTrackColor: MaveTheme.accent,
                onChanged: (val) => setState(() => _isPrimaryHost = val),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetricTile({
    required String title,
    required String value,
    required String subtitle,
    required IconData icon,
    required Color color,
  }) {
    return MaveSurfaceCard(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  title,
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                  style: const TextStyle(
                    color: MaveTheme.text3,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const SizedBox(width: 4),
              Icon(icon, size: 16, color: color),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: MaveTheme.text1,
              fontSize: 20,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
            style: const TextStyle(color: MaveTheme.text3, fontSize: 10),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterPill(String filterKey, String label) {
    final isSelected = _activeFilter == filterKey;
    return TactileButton(
      onTap: () => setState(() => _activeFilter = filterKey),
      color: isSelected ? MaveTheme.accent : MaveTheme.surface2,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      borderRadius: BorderRadius.circular(MaveTheme.rSm),
      border: Border.all(
        color: isSelected ? MaveTheme.accent : MaveTheme.borderSubtle,
      ),
      child: Text(
        label,
        style: TextStyle(
          color: isSelected ? Colors.white : MaveTheme.text2,
          fontSize: 11,
          fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
        ),
      ),
    );
  }

  Widget _buildDeviceCard(MeshDevice device) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      child: MaveSurfaceCard(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: MaveTheme.surface3,
                borderRadius: BorderRadius.circular(MaveTheme.rSm),
                border: Border.all(color: MaveTheme.borderSubtle),
              ),
              child: Center(
                child: Icon(
                  device.role == 'primary_host'
                      ? Icons.desktop_windows
                      : (device.os.contains('macOS') ? Icons.laptop_mac : Icons.view_in_ar),
                  size: 20,
                  color: MaveTheme.text1,
                ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        device.name,
                        style: const TextStyle(
                          color: MaveTheme.text1,
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: device.role == 'primary_host'
                              ? MaveTheme.accentSubtle
                              : MaveTheme.surface3,
                          borderRadius: BorderRadius.circular(MaveTheme.rSm),
                          border: Border.all(
                            color: device.role == 'primary_host'
                                ? MaveTheme.accent
                                : MaveTheme.borderSubtle,
                          ),
                        ),
                        child: Text(
                          device.role.toUpperCase(),
                          style: TextStyle(
                            color: device.role == 'primary_host'
                                ? MaveTheme.accent
                                : MaveTheme.text2,
                            fontSize: 9,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${device.os} · ${device.cpuCores} Cores · ${device.ramGb}GB RAM · ${device.vramGb}GB VRAM · ${device.temperatureC}°C',
                    style: const TextStyle(color: MaveTheme.text3, fontSize: 11),
                  ),
                ],
              ),
            ),
            // Battery & Status Indicator
            Row(
              children: [
                if (device.batteryPct < 100) ...[
                  Icon(
                    device.isCharging ? Icons.battery_charging_full : Icons.battery_std,
                    size: 16,
                    color: device.batteryPct < 25 ? MaveTheme.danger : MaveTheme.text2,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${device.batteryPct}%',
                    style: const TextStyle(color: MaveTheme.text2, fontSize: 11),
                  ),
                  const SizedBox(width: 12),
                ],
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: MaveTheme.success,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                const Text(
                  'ONLINE',
                  style: TextStyle(
                    color: MaveTheme.success,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTaskCard(MeshDagTask task) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: MaveSurfaceCard(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.code, size: 16, color: MaveTheme.accent),
                    const SizedBox(width: 8),
                    Text(
                      task.title,
                      style: const TextStyle(
                        color: MaveTheme.text1,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                Text(
                  '${(task.progress * 100).toInt()}%',
                  style: const TextStyle(
                    color: MaveTheme.accent,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            LinearProgressIndicator(
              value: task.progress,
              backgroundColor: MaveTheme.surface3,
              valueColor: const AlwaysStoppedAnimation<Color>(MaveTheme.accent),
              minHeight: 4,
              borderRadius: BorderRadius.circular(2),
            ),
            const SizedBox(height: 6),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Assigned to: ${task.assignedDevice}',
                  style: const TextStyle(color: MaveTheme.text3, fontSize: 10),
                ),
                Text(
                  task.status.toUpperCase(),
                  style: TextStyle(
                    color: task.status == 'completed' ? MaveTheme.success : MaveTheme.info,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
