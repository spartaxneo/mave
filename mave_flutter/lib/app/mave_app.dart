import 'package:flutter/material.dart';
import '../core/theme/mave_theme.dart';
import '../core/tactile/tactile_feedback.dart';
import '../features/island/dynamic_island_overlay.dart';
import '../features/mascot/vorssaint_mascot.dart';
import '../features/chat/chat_workspace_view.dart';
import '../features/mesh/mesh_dashboard_view.dart';
import '../features/local_ai/local_ai_view.dart';
import '../features/virtual_computer/virtual_computer_view.dart';
import '../features/memory/memory_vault_view.dart';
import '../features/onboarding/autonomous_setup_view.dart';
import '../core/network/mesh_client.dart';

/// MAVE Cross-Platform Shell
/// Runs on Windows, macOS, Linux, iOS, Android, and Meta Oculus Quest (Horizon OS).
class MaveAppShell extends StatefulWidget {
  final bool initialProvisioned;
  final MeshClient? client;

  const MaveAppShell({
    super.key,
    this.initialProvisioned = false,
    this.client,
  });

  @override
  State<MaveAppShell> createState() => _MaveAppShellState();
}

class _MaveAppShellState extends State<MaveAppShell> {
  late bool _isProvisioned;
  int _activeNavIndex = 0;
  MascotMood _mascotMood = MascotMood.idle;
  Offset _mascotPosition = const Offset(24, 80);

  @override
  void initState() {
    super.initState();
    _isProvisioned = widget.initialProvisioned;
    if (!_isProvisioned) {
      _checkProvisionStatus();
    }
  }

  Future<void> _checkProvisionStatus() async {
    final client = widget.client ?? MeshClient.instance;
    final status = await client.getProvisionStatus();
    if (status.step == 'ready' && mounted) {
      setState(() => _isProvisioned = true);
    }
  }

  final List<Widget> _views = const [
    ChatWorkspaceView(),
    MeshDashboardView(),
    LocalAiView(),
    VirtualComputerView(),
    MemoryVaultView(),
  ];

  final List<Map<String, dynamic>> _navItems = const [
    {'label': 'Canvas', 'icon': Icons.chat_bubble_outline, 'activeIcon': Icons.chat_bubble},
    {'label': 'Mesh', 'icon': Icons.hub_outlined, 'activeIcon': Icons.hub},
    {'label': 'Local AI', 'icon': Icons.memory_outlined, 'activeIcon': Icons.memory},
    {'label': 'Virtual PC', 'icon': Icons.terminal_outlined, 'activeIcon': Icons.terminal},
    {'label': 'Vault', 'icon': Icons.storage_outlined, 'activeIcon': Icons.storage},
  ];

  void _handleQuickIslandAction(String actionKey) {
    int targetIndex = 0;
    switch (actionKey) {
      case 'mesh':
        targetIndex = 1;
        break;
      case 'local_ai':
        targetIndex = 2;
        break;
      case 'virtual_pc':
        targetIndex = 3;
        break;
      case 'memory':
      case 'settings':
        targetIndex = 4;
        break;
      default:
        targetIndex = 0;
    }
    setState(() {
      _activeNavIndex = targetIndex;
      _mascotMood = MascotMood.happy;
    });
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _mascotMood = MascotMood.idle);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_isProvisioned) {
      return AutonomousSetupView(
        client: widget.client,
        onSetupComplete: () {
          setState(() {
            _isProvisioned = true;
            _mascotMood = MascotMood.happy;
          });
          Future.delayed(const Duration(seconds: 2), () {
            if (mounted) setState(() => _mascotMood = MascotMood.idle);
          });
        },
      );
    }

    final screenWidth = MediaQuery.of(context).size.width;
    final isDesktop = screenWidth >= 768;

    return Scaffold(
      backgroundColor: MaveTheme.bg,
      body: Stack(
        children: [
          // Main Body Layout
          Row(
            children: [
              // Left Tactile Navigation Sidebar (Desktop / Tablet)
              if (isDesktop) _buildDesktopSidebar(),

              // Central View Area
              Expanded(
                child: Column(
                  children: [
                    // Top Space for Dynamic Island
                    const SizedBox(height: 52),

                    // Active Tab View Canvas
                    Expanded(
                      child: IndexedStack(
                        index: _activeNavIndex,
                        children: _views,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          // Floating Top Dynamic Island HUD
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandOverlay(
              onQuickAction: _handleQuickIslandAction,
              onSubmitPrompt: (prompt) {
                setState(() => _mascotMood = MascotMood.thinking);
                Future.delayed(const Duration(seconds: 3), () {
                  if (mounted) setState(() => _mascotMood = MascotMood.idle);
                });
              },
            ),
          ),

          // Draggable Vorssaint Tactile Mascot
          Positioned(
            right: _mascotPosition.dx,
            bottom: _mascotPosition.dy,
            child: GestureDetector(
              onPanUpdate: (details) {
                setState(() {
                  _mascotPosition = Offset(
                    (_mascotPosition.dx - details.delta.dx).clamp(10.0, screenWidth - 90.0),
                    (_mascotPosition.dy - details.delta.dy).clamp(10.0, 600.0),
                  );
                });
              },
              child: VorssaintMascot(
                mood: _mascotMood,
                size: 74,
                onTap: () {
                  setState(() {
                    _mascotMood = _mascotMood == MascotMood.happy
                        ? MascotMood.speaking
                        : MascotMood.happy;
                  });
                  Future.delayed(const Duration(seconds: 3), () {
                    if (mounted) setState(() => _mascotMood = MascotMood.idle);
                  });
                },
              ),
            ),
          ),
        ],
      ),

      // Bottom Tactile Navigation Bar (Mobile / Oculus Quest 2D Panel)
      bottomNavigationBar: isDesktop ? null : _buildMobileBottomBar(),
    );
  }

  Widget _buildDesktopSidebar() {
    return Container(
      width: 72,
      decoration: const BoxDecoration(
        color: MaveTheme.sidebarBg,
        border: Border(right: BorderSide(color: MaveTheme.borderSubtle)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 14),

          // Mave Brand Pill
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: MaveTheme.accentSubtle,
              borderRadius: BorderRadius.circular(MaveTheme.rMd),
              border: Border.all(color: MaveTheme.accent.withValues(alpha: 0.4)),
            ),
            child: const Center(
              child: Text(
                'M',
                style: TextStyle(
                  color: MaveTheme.accent,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),

          const SizedBox(height: 28),

          // Navigation Icons
          Expanded(
            child: ListView.builder(
              itemCount: _navItems.length,
              itemBuilder: (context, index) {
                final item = _navItems[index];
                final isSelected = _activeNavIndex == index;

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                  child: TactileButton(
                    onTap: () => setState(() => _activeNavIndex = index),
                    color: isSelected ? MaveTheme.surface3 : Colors.transparent,
                    padding: const EdgeInsets.all(10),
                    borderRadius: BorderRadius.circular(MaveTheme.rMd),
                    border: isSelected ? Border.all(color: MaveTheme.accent) : null,
                    child: Icon(
                      isSelected ? item['activeIcon'] as IconData : item['icon'] as IconData,
                      size: 20,
                      color: isSelected ? MaveTheme.accent : MaveTheme.text3,
                    ),
                  ),
                );
              },
            ),
          ),

          // Re-run Autonomous Setup / Telemetry
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: TactileButton(
              onTap: () => setState(() => _isProvisioned = false),
              color: Colors.transparent,
              child: const Icon(Icons.auto_awesome, size: 20, color: MaveTheme.accent),
            ),
          ),

          // Bottom Settings / Profile Icon
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: TactileButton(
              onTap: () => setState(() => _activeNavIndex = 4),
              color: Colors.transparent,
              child: const Icon(Icons.tune, size: 20, color: MaveTheme.text3),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMobileBottomBar() {
    return Container(
      decoration: const BoxDecoration(
        color: MaveTheme.sidebarBg,
        border: Border(top: BorderSide(color: MaveTheme.borderSubtle)),
      ),
      child: SafeArea(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: List.generate(_navItems.length, (index) {
            final item = _navItems[index];
            final isSelected = _activeNavIndex == index;

            return Expanded(
              child: TactileButton(
                onTap: () => setState(() => _activeNavIndex = index),
                color: Colors.transparent,
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isSelected ? item['activeIcon'] as IconData : item['icon'] as IconData,
                      size: 20,
                      color: isSelected ? MaveTheme.accent : MaveTheme.text3,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      item['label'] as String,
                      style: TextStyle(
                        color: isSelected ? MaveTheme.accent : MaveTheme.text3,
                        fontSize: 10,
                        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}
