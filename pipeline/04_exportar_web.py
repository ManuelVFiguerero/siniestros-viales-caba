"""Paso 4: genera los JSON livianos que consume la web (puntos + estadísticas por clima)."""
import json

import pandas as pd

from clima import clasificar_condicion
from config import CLIMA_HORARIO, CONDICIONES, SINIESTROS_CLIMA, WEB_DATA

GRAVEDADES = ["LEVE", "GRAVE", "MORTAL"]
ESTRATO = ["punto_clima", "anio", "hora", "finde"]


def agregar_estrato(df: pd.DataFrame) -> pd.DataFrame:
    return df.assign(
        anio=df["fecha_hora"].dt.year,
        hora=df["fecha_hora"].dt.hour,
        finde=df["fecha_hora"].dt.dayofweek >= 5,
    )


def riesgo_por_condicion(df: pd.DataFrame, clima: pd.DataFrame) -> list[dict]:
    """Riesgo relativo de cada condición climática frente a "despejado", estandarizado.

    Contar siniestros por clima no sirve: "despejado" siempre gana porque es lo más
    frecuente, y la niebla parece segura porque ocurre de madrugada (poco tránsito).
    Por eso se compara cada hora con lluvia/niebla/etc. contra horas despejadas de la
    misma zona, año, hora del día y tipo de día (hábil/finde):

        esperados_c = sum_estrato horas_c(estrato) * tasa_despejado(estrato)
        riesgo_relativo_c = observados_c / esperados_c

    (estandarización indirecta, la misma idea que una SMR en epidemiología).
    """
    clima = agregar_estrato(clima.assign(condicion=clasificar_condicion(clima)))
    df = agregar_estrato(df.drop(columns=["anio", "hora"]))

    horas = clima.groupby(ESTRATO + ["condicion"]).size().rename("horas")
    casos = df.groupby(ESTRATO + ["condicion"]).size().rename("siniestros")
    t = pd.concat([horas, casos], axis=1).fillna(0).reset_index()

    base = t[t["condicion"] == "despejado"].set_index(ESTRATO)
    tasa_base = (base["siniestros"] / base["horas"]).rename("tasa_base")
    t = t.join(tasa_base, on=ESTRATO).dropna(subset=["tasa_base"])
    t["esperados"] = t["horas"] * t["tasa_base"]

    r = t.groupby("condicion")[["siniestros", "esperados", "horas"]].sum()
    n_puntos = clima["punto_clima"].nunique()
    return [
        {
            "condicion": c,
            "siniestros": int(r.loc[c, "siniestros"]),
            "horas": int(r.loc[c, "horas"] / n_puntos),
            "esperados": round(float(r.loc[c, "esperados"]), 1),
            "riesgo_relativo": round(float(r.loc[c, "siniestros"] / r.loc[c, "esperados"]), 2),
        }
        for c in CONDICIONES
        if c in r.index
    ]


def main() -> None:
    df = pd.read_parquet(SINIESTROS_CLIMA)
    clima = pd.read_parquet(CLIMA_HORARIO)
    # Se reclasifica acá para que un cambio en clima.py no obligue a re-correr el paso 3.
    df["condicion"] = clasificar_condicion(df)
    modos = df["modo"].value_counts().index.tolist()

    # Formato columnar con índices a diccionarios: ~5x más chico que una lista de objetos.
    puntos = {
        "dicts": {"condicion": CONDICIONES, "gravedad": GRAVEDADES, "modo": modos},
        "lon": df["lon"].round(5).tolist(),
        "lat": df["lat"].round(5).tolist(),
        "anio": df["anio"].astype(int).tolist(),
        "hora": df["hora"].astype(int).tolist(),
        "dia_semana": df["dia_semana"].astype(int).tolist(),
        "condicion": df["condicion"].map(CONDICIONES.index).tolist(),
        "gravedad": df["gravedad"].map(GRAVEDADES.index).fillna(0).astype(int).tolist(),
        "modo": df["modo"].map(modos.index).tolist(),
    }
    stats = {
        "total": len(df),
        "desde": df["fecha_hora"].min().strftime("%Y-%m-%d"),
        "hasta": df["fecha_hora"].max().strftime("%Y-%m-%d"),
        "por_condicion": riesgo_por_condicion(df, clima),
    }

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "siniestros.json").write_text(json.dumps(puntos, separators=(",", ":")))
    (WEB_DATA / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2))
    print(f"Exportado a {WEB_DATA}")
    print(pd.DataFrame(stats["por_condicion"]).to_string(index=False))


if __name__ == "__main__":
    main()
