import 'package:flutter/material.dart';
import '../../core/theme/mave_theme.dart';
import '../../core/tactile/tactile_feedback.dart';

class MemoryFact {
  final String id;
  final String category;
  final String key;
  final String value;
  final DateTime lastUpdated;

  const MemoryFact({
    required this.id,
    required this.category,
    required this.key,
    required this.value,
    required this.lastUpdated,
  });
}

class KgTriple {
  final String subject;
  final String predicate;
  final String object;

  const KgTriple({
    required this.subject,
    required this.predicate,
    required this.object,
  });
}

/// MAVE Multi-Tenant Memory Store & Personal Knowledge Graph
/// Partitioned by user identity with DPAPI-backed secret vault.
class MemoryVaultView extends StatefulWidget {
  const MemoryVaultView({super.key});

  @override
  State<MemoryVaultView> createState() => _MemoryVaultViewState();
}

class _MemoryVaultViewState extends State<MemoryVaultView> {
  String _activeUserId = 'default';
  final List<String> _users = ['default', 'usr_developer', 'usr_guest'];

  final List<MemoryFact> _facts = [
    MemoryFact(
      id: 'f-01',
      category: 'CODING_PROJECT',
      key: 'preferred_framework',
      value: 'Flutter 3.44.0 (Windows, macOS, Linux, iOS, Android, Oculus)',
      lastUpdated: DateTime.now().subtract(const Duration(hours: 1)),
    ),
    MemoryFact(
      id: 'f-02',
      category: 'PREFERENCES',
      key: 'inference_policy',
      value: 'Strict Local Only (Vulkan Qwen3-VL 8B + Colibri MoE)',
      lastUpdated: DateTime.now().subtract(const Duration(hours: 2)),
    ),
    MemoryFact(
      id: 'f-03',
      category: 'DEVICE_TELEMETRY',
      key: 'mesh_role',
      value: 'primary_host (LAN Challenge-Response Ed25519)',
      lastUpdated: DateTime.now().subtract(const Duration(hours: 4)),
    ),
  ];

  final List<KgTriple> _triples = const [
    KgTriple(subject: 'MAVE', predicate: 'runs_on', object: 'Flutter Impeller Engine'),
    KgTriple(subject: 'MAVE', predicate: 'supports_spatial', object: 'Meta Oculus Horizon OS'),
    KgTriple(subject: 'Brain Mesh', predicate: 'secures_with', object: 'Ed25519 & HMAC-SHA256'),
    KgTriple(subject: 'Local Router', predicate: 'prioritizes', object: 'Qwen3-VL 8B Vulkan'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MaveTheme.bg,
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // User Partition Selector Header
            _buildUserSelectorCard(),

            const SizedBox(height: 16),

            // Scoped Credential Vault (Presence Flags Only, LR-083)
            _buildCredentialVaultCard(),

            const SizedBox(height: 20),

            // Fact Store
            const Text(
              'SCOPED MEMORY FACTS STORE',
              style: TextStyle(
                color: MaveTheme.text3,
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 8),
            ..._facts.map(_buildFactCard),

            const SizedBox(height: 20),

            // Semantic Knowledge Graph Triples
            const Text(
              'SEMANTIC KNOWLEDGE GRAPH TRIPLES',
              style: TextStyle(
                color: MaveTheme.text3,
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(height: 8),
            ..._triples.map(_buildTripleCard),
          ],
        ),
      ),
    );
  }

  Widget _buildUserSelectorCard() {
    return MaveSurfaceCard(
      backgroundColor: MaveTheme.surface1,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: MaveTheme.accentSubtle,
                  borderRadius: BorderRadius.circular(MaveTheme.rSm),
                ),
                child: const Icon(Icons.person_outline, color: MaveTheme.accent, size: 18),
              ),
              const SizedBox(width: 12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'MULTI-TENANT MEMORY PARTITION',
                    style: TextStyle(
                      color: MaveTheme.text1,
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Active Tenant: %APPDATA%/mave/users/$_activeUserId',
                    style: const TextStyle(color: MaveTheme.text3, fontSize: 11),
                  ),
                ],
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
            decoration: BoxDecoration(
              color: MaveTheme.surface2,
              borderRadius: BorderRadius.circular(MaveTheme.rSm),
              border: Border.all(color: MaveTheme.borderSubtle),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _activeUserId,
                dropdownColor: MaveTheme.surface1,
                style: const TextStyle(color: MaveTheme.text1, fontSize: 12),
                items: _users.map((u) {
                  return DropdownMenuItem<String>(value: u, child: Text(u));
                }).toList(),
                onChanged: (val) {
                  if (val != null) setState(() => _activeUserId = val);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCredentialVaultCard() {
    return MaveSurfaceCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Row(
            children: [
              Icon(Icons.lock_outline, size: 16, color: MaveTheme.accent),
              SizedBox(width: 8),
              Text(
                'DPAPI Hardware Vault: Anthropic [Active] · OpenAI [Active] · Gemini [Active]',
                style: TextStyle(color: MaveTheme.text2, fontSize: 11),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: MaveTheme.accentSubtle,
              borderRadius: BorderRadius.circular(MaveTheme.rSm),
            ),
            child: const Text(
              'ENCRYPTED',
              style: TextStyle(color: MaveTheme.accent, fontSize: 10, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFactCard(MemoryFact fact) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      child: MaveSurfaceCard(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: MaveTheme.surface3,
                borderRadius: BorderRadius.circular(MaveTheme.rSm),
              ),
              child: Text(
                fact.category,
                style: const TextStyle(color: MaveTheme.text3, fontSize: 9, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    fact.key,
                    style: const TextStyle(
                      color: MaveTheme.text1,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    fact.value,
                    style: const TextStyle(color: MaveTheme.text2, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTripleCard(KgTriple triple) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      child: MaveSurfaceCard(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Text(
              triple.subject,
              style: const TextStyle(color: MaveTheme.accent, fontSize: 11, fontWeight: FontWeight.bold),
            ),
            const SizedBox(width: 6),
            const Icon(Icons.arrow_right_alt, size: 14, color: MaveTheme.text3),
            const SizedBox(width: 6),
            Text(
              triple.predicate,
              style: const TextStyle(color: MaveTheme.text3, fontSize: 11),
            ),
            const SizedBox(width: 6),
            const Icon(Icons.arrow_right_alt, size: 14, color: MaveTheme.text3),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                triple.object,
                style: const TextStyle(color: MaveTheme.text1, fontSize: 11, fontWeight: FontWeight.w500),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
