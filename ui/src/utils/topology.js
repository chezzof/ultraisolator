export function groupCoresByLlc(cores = [], llcGroups = []) {
  const coresById = new Map(cores.map((core) => [core.id, core]));
  const grouped = llcGroups.map((llc) => ({
    ...llc,
    cores: (llc.core_ids || []).map((coreId) => coresById.get(coreId)).filter(Boolean)
  }));
  const groupedCoreIds = new Set(grouped.flatMap((llc) => llc.cores.map((core) => core.id)));
  const ungrouped = cores.filter((core) => !groupedCoreIds.has(core.id));
  if (ungrouped.length) {
    grouped.push({
      id: 'ungrouped',
      group: 0,
      llc_index: 'unassigned',
      l3_size_bytes: 0,
      cores: ungrouped
    });
  }
  return grouped;
}
