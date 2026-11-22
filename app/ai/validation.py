"""配件选择、基础兼容性与预算检查。"""
from decimal import Decimal
from .schemas import CORE

def selected_parts(selection, parts):
    by_id = {part["id"]: part for part in parts}
    result = {}
    for category, part_id in selection.items():
        part = by_id.get(part_id)
        if not part or part["category"] != category:
            raise ValueError("方案包含已下架、分类不符或不存在的配件，请刷新后重新生成")
        result[category] = part
    return result


def compatibility(parts):
    issues = []
    cpu, board, ram = (parts.get(key) for key in ("cpu", "board", "ram"))
    if cpu and board and (not cpu["socket"] or cpu["socket"] != board["socket"]):
        issues.append("CPU 与主板插槽不匹配或缺少插槽信息")
    if ram and board and (not ram["ddr"] or ram["ddr"] != board["ddr"]):
        issues.append("内存与主板代际不匹配或缺少内存代际信息")
    power = sum((parts.get(key) or {}).get("power") or 0 for key in ("cpu", "gpu")) + 100
    if "psu" in parts and (parts["psu"]["watts"] or 0) < power * 1.25:
        issues.append("电源额定功率不足或缺少功率信息")
    return issues


def validate_plan(selection, parts, data):
    required = CORE | set(data.peripherals)
    if set(selection) != required:
        raise ValueError("请包含完整八类主机配件及指定外设，且不加入未要求的外设")
    chosen = selected_parts(selection, parts)
    issues = compatibility(chosen)
    if issues:
        raise ValueError("；".join(issues))
    total = sum((part["price"] for part in chosen.values()), Decimal(0))
    if total > data.budget:
        raise ValueError("方案超出预算，请降低配件成本")
    return chosen, total

