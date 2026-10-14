"""C10 fixed graph-metric fitter. Initial no-op for the recorded RED run."""
import copy
def fit_metric(graph, penalty=.01, floor=.01, maxiter=30):
    return copy.deepcopy(graph), {'iterations':0}
