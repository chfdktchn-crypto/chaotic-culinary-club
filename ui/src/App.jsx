import React, { useState, useEffect } from "react";
import axios from "axios";

const API_URL = "https://captivating-harmony-production-c590.up.railway.app";
const CUISINES = ["Any", "Italian", "Mexican", "Japanese", "Indian", "French", "Thai", "Mediterranean"];
const STORAGE_KEY = "chefai_favourites";
const PRICES_KEY = "chefai_prices";

function loadFavourites() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveFavourites(favs) { localStorage.setItem(STORAGE_KEY, JSON.stringify(favs)); }

function loadPrices() {
  try { return JSON.parse(localStorage.getItem(PRICES_KEY) || "{}"); }
  catch { return {}; }
}
function savePrices(prices) { localStorage.setItem(PRICES_KEY, JSON.stringify(prices)); }

function scaleQty(ingredient, factor) {
  const match = ingredient.match(/^(\d+\.?\d*|\d+\/\d+)\s*/);
  if (!match) return ingredient;
  let qty;
  if (match[1].includes("/")) {
    const [n, d] = match[1].split("/");
    qty = parseFloat(n) / parseFloat(d);
  } else {
    qty = parseFloat(match[1]);
  }
  const scaled = qty * factor;
  const formatted = scaled === Math.floor(scaled) ? String(Math.floor(scaled)) : scaled.toFixed(1).replace(/\.?0+$/, "");
  return formatted + " " + ingredient.slice(match[0].length);
}

// Extract numeric quantity from an ingredient string
function parseQty(ingredient) {
  const match = ingredient.match(/^(\d+\.?\d*|\d+\/\d+)\s*/);
  if (!match) return 1;
  if (match[1].includes("/")) {
    const [n, d] = match[1].split("/");
    return parseFloat(n) / parseFloat(d);
  }
  return parseFloat(match[1]);
}

function RecipeDisplay({ recipe, servings, onServingsChange, onSave, isSaved }) {
  const factor = servings / (recipe.base_servings || 2);
  return (
    <div className="recipe-box">
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start"}}>
        <div className="recipe-title">{recipe.title}</div>
        {onSave && (
          <button className={`btn-save ${isSaved ? "saved" : ""}`} onClick={onSave}>
            {isSaved ? "✓ Saved" : "Save"}
          </button>
        )}
      </div>

      <div className="servings-row">
        <span className="section-label" style={{margin:0}}>Servings</span>
        <div className="servings-control">
          <button className="srv-btn" onClick={() => onServingsChange(Math.max(1, servings - 1))}>−</button>
          <span className="srv-val">{servings}</span>
          <button className="srv-btn" onClick={() => onServingsChange(servings + 1)}>+</button>
        </div>
      </div>

      {recipe.ingredients && recipe.ingredients.length > 0 && (
        <>
          <div className="section-label">Ingredients</div>
          <ul className="ingredient-list">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{factor !== 1 ? scaleQty(ing, factor) : ing}</li>
            ))}
          </ul>
        </>
      )}
      {recipe.steps && recipe.steps.length > 0 && (
        <>
          <div className="section-label">Method</div>
          <ol className="step-list">
            {recipe.steps.map((step, i) => (
              <li key={i}><span className="step-num">{i + 1}.</span><span>{step}</span></li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function CostingTab({ favourites, genRecipe, findRecipe }) {
  const [prices, setPrices] = useState(loadPrices);
  const [selectedKey, setSelectedKey] = useState(null);
  const [costServings, setCostServings] = useState(2);

  // Build list of available recipes
  const options = [];
  if (genRecipe) options.push({ key: "__gen__", label: `[Generated] ${genRecipe.title}`, recipe: genRecipe });
  if (findRecipe) options.push({ key: "__find__", label: `[Found] ${findRecipe.title}`, recipe: findRecipe });
  favourites.forEach((fav, i) => options.push({ key: `fav_${i}`, label: fav.title, recipe: fav }));

  // Auto-select first option when options change
  useEffect(() => {
    if (options.length > 0 && (selectedKey === null || !options.find(o => o.key === selectedKey))) {
      setSelectedKey(options[0].key);
      setCostServings(options[0].recipe.base_servings || 2);
    }
  }, [genRecipe, findRecipe, favourites.length]);

  const selected = options.find(o => o.key === selectedKey);
  const recipe = selected ? selected.recipe : null;
  const factor = recipe ? costServings / (recipe.base_servings || 2) : 1;

  const handlePriceChange = (ingredientName, value) => {
    const updated = { ...prices, [ingredientName]: value };
    setPrices(updated);
    savePrices(updated);
  };

  const handleRecipeSelect = (key) => {
    setSelectedKey(key);
    const opt = options.find(o => o.key === key);
    if (opt) setCostServings(opt.recipe.base_servings || 2);
  };

  // Compute costs
  let totalCost = 0;
  const rows = recipe ? recipe.ingredients.map(ing => {
    const scaledQty = factor !== 1 ? parseQty(scaleQty(ing, factor)) : parseQty(ing);
    const baseQty = parseQty(ing);
    const priceKey = ing.toLowerCase().trim();
    const priceVal = parseFloat(prices[priceKey] || "");
    const lineCost = isNaN(priceVal) ? null : priceVal;
    if (lineCost !== null) totalCost += lineCost;
    return { ing, scaledIng: factor !== 1 ? scaleQty(ing, factor) : ing, priceKey, lineCost };
  }) : [];

  const hasAnyCost = rows.some(r => r.lineCost !== null);
  const costPerServing = hasAnyCost ? totalCost / costServings : null;

  if (options.length === 0) {
    return <div className="empty">No recipes available to cost yet. Generate or find a recipe first, or save some favourites.</div>;
  }

  return (
    <div>
      <label>Select Recipe</label>
      <select value={selectedKey || ""} onChange={e => handleRecipeSelect(e.target.value)}>
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>

      {recipe && (
        <>
          <div className="servings-row" style={{marginTop:"1.2rem"}}>
            <span className="section-label" style={{margin:0}}>Servings</span>
            <div className="servings-control">
              <button className="srv-btn" onClick={() => setCostServings(Math.max(1, costServings - 1))}>−</button>
              <span className="srv-val">{costServings}</span>
              <button className="srv-btn" onClick={() => setCostServings(costServings + 1)}>+</button>
            </div>
          </div>

          <div className="section-label" style={{marginTop:"1.2rem"}}>Ingredient Costs</div>
          <div className="cost-hint">Enter the total price you pay for each ingredient (e.g. $3.50 for a whole can of tomatoes). Leave blank to exclude from total.</div>

          <div className="cost-table">
            <div className="cost-header">
              <span>Ingredient</span>
              <span>Qty needed</span>
              <span>Price ($)</span>
              <span>Cost</span>
            </div>
            {rows.map((row, i) => (
              <div key={i} className="cost-row">
                <span className="cost-ing">{row.ing}</span>
                <span className="cost-qty">{row.scaledIng}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="cost-input"
                  placeholder="0.00"
                  value={prices[row.priceKey] || ""}
                  onChange={e => handlePriceChange(row.priceKey, e.target.value)}
                />
                <span className="cost-line">
                  {row.lineCost !== null ? `$${row.lineCost.toFixed(2)}` : "—"}
                </span>
              </div>
            ))}
          </div>

          {hasAnyCost && (
            <div className="cost-totals">
              <div className="cost-total-row">
                <span>Total Recipe Cost</span>
                <span className="cost-total-val">${totalCost.toFixed(2)}</span>
              </div>
              <div className="cost-total-row">
                <span>Cost Per Serving ({costServings} servings)</span>
                <span className="cost-total-val">${costPerServing.toFixed(2)}</span>
              </div>
            </div>
          )}

          {!hasAnyCost && (
            <div className="empty" style={{paddingTop:"1rem"}}>Enter prices above to see cost breakdown.</div>
          )}
        </>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("generate");
  const [favourites, setFavourites] = useState(loadFavourites);
  const [selectedFav, setSelectedFav] = useState(null);
  const [favServings, setFavServings] = useState({});

  // Generate tab
  const [ingredients, setIngredients] = useState("");
  const [cuisine, setCuisine] = useState("Any");
  const [maxTime, setMaxTime] = useState(30);
  const [baseServings, setBaseServings] = useState(2);
  const [genRecipe, setGenRecipe] = useState(null);
  const [genServings, setGenServings] = useState(2);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");

  // Find tab
  const [dish, setDish] = useState("");
  const [findCuisine, setFindCuisine] = useState("Any");
  const [findServings, setFindServings] = useState(2);
  const [findRecipe, setFindRecipe] = useState(null);
  const [findRecipeServings, setFindRecipeServings] = useState(2);
  const [findLoading, setFindLoading] = useState(false);
  const [findError, setFindError] = useState("");

  useEffect(() => { saveFavourites(favourites); }, [favourites]);

  const handleSave = (recipe) => {
    if (!recipe) return;
    if (favourites.some(f => f.title === recipe.title)) return;
    setFavourites([{ ...recipe, savedAt: new Date().toISOString() }, ...favourites]);
  };

  const handleDelete = (index) => {
    setFavourites(favourites.filter((_, i) => i !== index));
    if (selectedFav === index) setSelectedFav(null);
  };

  const handleGenerate = async () => {
    const ingList = ingredients.split(",").map(i => i.trim()).filter(Boolean);
    if (!ingList.length) { setGenError("Please enter at least one ingredient."); return; }
    setGenError(""); setGenRecipe(null); setGenLoading(true);
    try {
      const res = await axios.post(`${API_URL}/generate`, {
        ingredients: ingList,
        cuisine: cuisine === "Any" ? null : cuisine,
        max_time: maxTime,
        servings: baseServings,
      });
      setGenRecipe(res.data);
      setGenServings(baseServings);
    } catch (e) {
      setGenError((e.response && e.response.data && e.response.data.detail) || e.message || "Something went wrong.");
    } finally { setGenLoading(false); }
  };

  const handleFind = async () => {
    if (!dish.trim()) { setFindError("Please enter a dish name."); return; }
    setFindError(""); setFindRecipe(null); setFindLoading(true);
    try {
      const res = await axios.post(`${API_URL}/find`, {
        dish: dish.trim(),
        cuisine: findCuisine === "Any" ? null : findCuisine,
        servings: findServings,
      });
      setFindRecipe(res.data);
      setFindRecipeServings(findServings);
    } catch (e) {
      setFindError((e.response && e.response.data && e.response.data.detail) || e.message || "Something went wrong.");
    } finally { setFindLoading(false); }
  };

  const isGenSaved = genRecipe && favourites.some(f => f.title === genRecipe.title);
  const isFindSaved = findRecipe && favourites.some(f => f.title === findRecipe.title);

  return (
    <div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { background: #0f0e0c; color: #f5f0e8; font-family: Georgia, serif; margin: 0; }
        .card { max-width: 680px; margin: 3rem auto; background: #1a1814; border: 1px solid #3a3530; border-radius: 4px; padding: 2.5rem; }
        h1 { font-size: 2.4rem; margin: 0; }
        .subtitle { color: #9a9080; font-style: italic; margin-top: 0.4rem; }
        .tabs { display: flex; margin: 1.5rem 0 0; border-bottom: 1px solid #3a3530; }
        .tab { padding: 0.6rem 1.2rem; font-family: monospace; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer; border: none; background: none; color: #9a9080; border-bottom: 2px solid transparent; margin-bottom: -1px; }
        .tab.active { color: #c8a96e; border-bottom-color: #c8a96e; }
        label { display: block; font-size: 0.75rem; font-family: monospace; letter-spacing: 0.12em; text-transform: uppercase; color: #9a9080; margin-bottom: 0.5rem; margin-top: 1.2rem; }
        input[type=text], input[type=number], select { width: 100%; background: #0f0e0c; border: 1px solid #3a3530; border-radius: 2px; color: #f5f0e8; font-size: 1rem; font-family: Georgia, serif; padding: 0.75rem 1rem; outline: none; }
        input[type=text]:focus, input[type=number]:focus, select:focus { border-color: #c8a96e; }
        .row { display: flex; gap: 1rem; }
        .row > div { flex: 1; }
        input[type=range] { width: 100%; accent-color: #c8a96e; }
        .time-val { font-family: monospace; color: #c8a96e; }
        .btn-primary { width: 100%; margin-top: 1.5rem; padding: 0.9rem; background: #c8a96e; color: #0f0e0c; border: none; border-radius: 2px; font-size: 1rem; font-family: Georgia, serif; font-weight: 700; cursor: pointer; }
        .btn-primary:disabled { background: #3a3530; color: #9a9080; cursor: not-allowed; }
        .btn-primary:hover:not(:disabled) { background: #daba80; }
        .error { margin-top: 1.5rem; padding: 0.75rem 1rem; background: #2a1a18; border: 1px solid #6b3030; border-radius: 2px; color: #e07060; font-family: monospace; }
        .recipe-box { margin-top: 1.5rem; padding: 1.5rem; background: #0f0e0c; border: 1px solid #3a3530; border-radius: 2px; }
        .recipe-title { font-size: 1.4rem; font-weight: 700; color: #c8a96e; margin-bottom: 0.5rem; }
        .btn-save { background: none; border: 1px solid #3a3530; border-radius: 2px; color: #9a9080; font-family: monospace; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.4rem 0.8rem; cursor: pointer; white-space: nowrap; }
        .btn-save.saved { border-color: #c8a96e; color: #c8a96e; }
        .servings-row { display: flex; align-items: center; justify-content: space-between; margin: 0.8rem 0; padding: 0.6rem 0; border-top: 1px solid #2a2520; border-bottom: 1px solid #2a2520; }
        .servings-control { display: flex; align-items: center; gap: 0.75rem; }
        .srv-btn { width: 28px; height: 28px; background: #2a2520; border: 1px solid #3a3530; border-radius: 2px; color: #c8a96e; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; }
        .srv-btn:hover { background: #3a3530; }
        .srv-val { font-family: monospace; font-size: 1rem; color: #f5f0e8; min-width: 24px; text-align: center; }
        .section-label { font-size: 0.7rem; font-family: monospace; letter-spacing: 0.15em; text-transform: uppercase; color: #9a9080; margin-bottom: 0.6rem; margin-top: 1.2rem; }
        .ingredient-list { list-style: none; padding: 0; margin: 0; }
        .ingredient-list li { padding: 0.3rem 0; color: #d5cfc5; border-bottom: 1px solid #2a2520; font-size: 0.95rem; }
        .ingredient-list li:last-child { border-bottom: none; }
        .step-list { list-style: none; padding: 0; margin: 0; }
        .step-list li { display: flex; gap: 1rem; padding: 0.6rem 0; color: #d5cfc5; border-bottom: 1px solid #2a2520; font-size: 0.95rem; line-height: 1.6; }
        .step-list li:last-child { border-bottom: none; }
        .step-num { font-family: monospace; color: #c8a96e; font-size: 0.8rem; min-width: 24px; padding-top: 3px; }
        .fav-list { margin-top: 1.5rem; }
        .fav-item { display: flex; justify-content: space-between; align-items: center; padding: 0.9rem 1rem; background: #0f0e0c; border: 1px solid #3a3530; border-radius: 2px; margin-bottom: 0.5rem; cursor: pointer; }
        .fav-item:hover { border-color: #c8a96e; }
        .fav-item.active { border-color: #c8a96e; }
        .fav-name { font-size: 1rem; color: #f5f0e8; }
        .fav-date { font-size: 0.7rem; font-family: monospace; color: #9a9080; margin-top: 0.2rem; }
        .btn-delete { background: none; border: none; color: #6b3030; font-size: 1.1rem; cursor: pointer; padding: 0 0.3rem; }
        .btn-delete:hover { color: #e07060; }
        .empty { text-align: center; color: #9a9080; font-style: italic; padding: 2rem 0; }
        .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #0f0e0c; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; margin-right: 8px; vertical-align: middle; }
        .cost-hint { font-size: 0.8rem; color: #9a9080; font-style: italic; margin-bottom: 0.8rem; margin-top: 0.3rem; }
        .cost-table { border: 1px solid #3a3530; border-radius: 2px; overflow: hidden; margin-top: 0.5rem; }
        .cost-header { display: grid; grid-template-columns: 2fr 2fr 1fr 1fr; gap: 0.5rem; padding: 0.5rem 0.75rem; background: #0f0e0c; font-size: 0.65rem; font-family: monospace; letter-spacing: 0.12em; text-transform: uppercase; color: #9a9080; border-bottom: 1px solid #3a3530; }
        .cost-row { display: grid; grid-template-columns: 2fr 2fr 1fr 1fr; gap: 0.5rem; padding: 0.5rem 0.75rem; align-items: center; border-bottom: 1px solid #2a2520; }
        .cost-row:last-child { border-bottom: none; }
        .cost-row:nth-child(even) { background: #161412; }
        .cost-ing { font-size: 0.9rem; color: #d5cfc5; }
        .cost-qty { font-size: 0.85rem; color: #9a9080; font-family: monospace; }
        .cost-input { width: 100%; background: #0f0e0c; border: 1px solid #3a3530; border-radius: 2px; color: #f5f0e8; font-size: 0.85rem; font-family: monospace; padding: 0.3rem 0.5rem; outline: none; }
        .cost-input:focus { border-color: #c8a96e; }
        .cost-line { font-size: 0.85rem; font-family: monospace; color: #c8a96e; text-align: right; }
        .cost-totals { margin-top: 1rem; padding: 1rem; background: #0f0e0c; border: 1px solid #3a3530; border-radius: 2px; }
        .cost-total-row { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #2a2520; }
        .cost-total-row:last-child { border-bottom: none; }
        .cost-total-row span:first-child { font-size: 0.8rem; font-family: monospace; letter-spacing: 0.08em; text-transform: uppercase; color: #9a9080; }
        .cost-total-val { font-size: 1.1rem; font-weight: 700; color: #c8a96e; font-family: monospace; }
      `}</style>
      <div className="card">
        <div style={{display:"flex", alignItems:"center", gap:"1rem"}}>
          <img src="/logo.png" alt="Chaotic Culinary Club" style={{height:"56px", width:"auto"}} />
          <h1>The Chaotic Culinary Club</h1>
        </div>
        <p className="subtitle">Let's get Culinating!!</p>

        <div className="tabs">
          <button className={`tab ${view === "generate" ? "active" : ""}`} onClick={() => setView("generate")}>Generate</button>
          <button className={`tab ${view === "find" ? "active" : ""}`} onClick={() => setView("find")}>Find a Recipe</button>
          <button className={`tab ${view === "favourites" ? "active" : ""}`} onClick={() => setView("favourites")}>
            Favourites {favourites.length > 0 ? `(${favourites.length})` : ""}
          </button>
          <button className={`tab ${view === "costing" ? "active" : ""}`} onClick={() => setView("costing")}>Costing</button>
        </div>

        {/* GENERATE TAB */}
        {view === "generate" && (
          <>
            <label>Ingredients</label>
            <input type="text" placeholder="eggs, tomato, basil, garlic…" value={ingredients}
              onChange={e => setIngredients(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !genLoading && handleGenerate()} />

            <div className="row">
              <div>
                <label>Cuisine</label>
                <select value={cuisine} onChange={e => setCuisine(e.target.value)}>
                  {CUISINES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Max time</label>
                <div style={{display:"flex", alignItems:"center", gap:"0.75rem"}}>
                  <input type="range" min={10} max={120} step={5} value={maxTime} onChange={e => setMaxTime(Number(e.target.value))} />
                  <span className="time-val">{maxTime} min</span>
                </div>
              </div>
            </div>

            <div style={{marginTop:"1.2rem"}}>
              <label>Servings</label>
              <div className="servings-control">
                <button className="srv-btn" onClick={() => setBaseServings(Math.max(1, baseServings - 1))}>−</button>
                <span className="srv-val">{baseServings}</span>
                <button className="srv-btn" onClick={() => setBaseServings(baseServings + 1)}>+</button>
              </div>
            </div>

            <button className="btn-primary" onClick={handleGenerate} disabled={genLoading || !ingredients.trim()}>
              {genLoading ? <><span className="spinner" />Cooking…</> : "Generate Recipe"}
            </button>

            {genError && <div className="error">{genError}</div>}
            {genRecipe && (
              <RecipeDisplay
                recipe={genRecipe}
                servings={genServings}
                onServingsChange={setGenServings}
                onSave={() => handleSave(genRecipe)}
                isSaved={isGenSaved}
              />
            )}
          </>
        )}

        {/* FIND TAB */}
        {view === "find" && (
          <>
            <label>Dish Name</label>
            <input type="text" placeholder="Chicken Alfredo, Beef Stew, Tiramisu…" value={dish}
              onChange={e => setDish(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !findLoading && handleFind()} />

            <div className="row">
              <div>
                <label>Cuisine Style</label>
                <select value={findCuisine} onChange={e => setFindCuisine(e.target.value)}>
                  {CUISINES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Servings</label>
                <div className="servings-control" style={{marginTop:"0.5rem"}}>
                  <button className="srv-btn" onClick={() => setFindServings(Math.max(1, findServings - 1))}>−</button>
                  <span className="srv-val">{findServings}</span>
                  <button className="srv-btn" onClick={() => setFindServings(findServings + 1)}>+</button>
                </div>
              </div>
            </div>

            <button className="btn-primary" onClick={handleFind} disabled={findLoading || !dish.trim()}>
              {findLoading ? <><span className="spinner" />Searching…</> : "Find Recipe"}
            </button>

            {findError && <div className="error">{findError}</div>}
            {findRecipe && (
              <RecipeDisplay
                recipe={findRecipe}
                servings={findRecipeServings}
                onServingsChange={setFindRecipeServings}
                onSave={() => handleSave(findRecipe)}
                isSaved={isFindSaved}
              />
            )}
          </>
        )}

        {/* FAVOURITES TAB */}
        {view === "favourites" && (
          <>
            {favourites.length === 0 && <div className="empty">No saved recipes yet. Generate one and hit Save!</div>}
            <div className="fav-list">
              {favourites.map((fav, i) => (
                <div key={i} className={`fav-item ${selectedFav === i ? "active" : ""}`}
                  onClick={() => { setSelectedFav(selectedFav === i ? null : i); setFavServings(s => ({...s, [i]: fav.base_servings || 2})); }}>
                  <div>
                    <div className="fav-name">{fav.title}</div>
                    <div className="fav-date">{new Date(fav.savedAt).toLocaleDateString()}</div>
                  </div>
                  <button className="btn-delete" onClick={e => { e.stopPropagation(); handleDelete(i); }}>✕</button>
                </div>
              ))}
            </div>
            {selectedFav !== null && favourites[selectedFav] && (
              <RecipeDisplay
                recipe={favourites[selectedFav]}
                servings={favServings[selectedFav] || favourites[selectedFav].base_servings || 2}
                onServingsChange={n => setFavServings(s => ({...s, [selectedFav]: n}))}
              />
            )}
          </>
        )}

        {/* COSTING TAB */}
        {view === "costing" && (
          <CostingTab
            favourites={favourites}
            genRecipe={genRecipe}
            findRecipe={findRecipe}
          />
        )}
      </div>
    </div>
  );
}
