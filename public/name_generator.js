var first =
    [
    "abelian",
    "associative",
    "computable",
    "Lebesgue-measurable",
    "semi-decidable",
    "simple",
    "combinatorial",
    "structure-preserving",
    "diagonalizable",
    "nonsingular",
    "orientable",
    "twice-differentiable",
    "thrice-differentiable",
    "countable",
    "prime",
    "complete",
    "continuous",
    "trivial",
    "3-connected",
    "bipartite",
    "planar",
    "finite",
    "nondeterministic",
    "alternating",
    "convex",
    "undecidable",
    "dihedral",
    "context-free",
    "rational",
    "regular",
    "Noetherian",
    "Cauchy",
    "open",
    "closed",
    "compact",
    "clopen",
    "pointless"
    ];

var second =
    [
    ["multiset", "multisets", true],
    ["integer", "integers", false],
    ["metric space", "metric spaces", true],
    ["group", "groups", true],
    ["monoid", "monoids", true],
    ["semigroup", "semigroups", true],
    ["ring", "rings", true],
    ["field", "fields", true],
    ["module", "modules", true],
    ["Turing machine", "Turing machines", false],
    ["topological space", "topological spaces", true],
    ["automorphism", "automorphisms", false],
    ["bijection", "bijections", false],
    ["DAG", "DAGs", false],
    ["generating function", "generating functions", false],
    ["taylor series", "taylor series", false],
    ["Hilbert space", "Hilbert spaces", true],
    ["linear transformation", "linear transformations", false],
    ["manifold", "manifolds", true],
    ["hypergraph", "hypergraphs", true],
    ["pushdown automaton", "pushdown automata", false],
    ["combinatorial game", "combinatorial games", false],
    ["residue class", "residue classes", true],
    ["equivalence relation", "equivalence relations", false],
    ["logistic system", "logistic systems", true],
    ["tournament", "tournaments", false],
    ["random variable", "random variables", false],
    ["complexity class", "complexity classes", true],
    ["triangulation", "triangulations", false],
    ["unbounded-fan-in circuit", "unbounded-fan-in circuits", false],
    ["log-space reduction", "log-space reductions", false],
    ["language", "languages", true],
    ["poset", "posets", true],
    ["algebra", "algebras", true],
    ["Markov chain", "Markov chains", false],
    ["4-form", "4-forms", false],
    ["7-chain", "7-chains", false],
    ];

function randomFirst()
{
    var ind = Math.floor(Math.random() * first.length);
    return first[ind];
}

function randomSecond(plural)
{
    var ind = Math.floor(Math.random() * second.length);
    if (plural)
        return second[ind][1];
    else
    {
        while (!second[ind][2])
            ind = Math.floor(Math.random() * second.length);
        return second[ind][0];
    }
}

function generate_name()
{
   return randomFirst() + ' ' + randomSecond(false);
}
